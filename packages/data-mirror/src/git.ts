/**
 * Git 执行封装(AGENTS §19.2 / §19.5)。
 * 使用系统 git 子进程(开放项"Git 执行采用系统 Git 还是库实现"当前选择系统 Git,
 * 后续可由 ADR 调整)。所有输出与错误信息必须脱敏后使用。
 */
import { spawn } from "node:child_process";

export interface GitRunResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface GitClientOptions {
  /** SSH 私钥临时文件路径(权限 600,engine 负责创建与清理) */
  sshPrivateKeyPath?: string;
  /** PAT 认证用的 askpass 脚本路径 */
  askPassPath?: string;
  /** askpass 脚本读取的 PAT 值(仅注入环境,不写进脚本文件) */
  patEnv?: string;
  /** git 可执行文件,默认 "git" */
  executable?: string;
  /** 单条命令超时毫秒,默认 60s */
  timeoutMs?: number;
}

export class GitCommandError extends Error {
  constructor(
    message: string,
    readonly args: string[],
    readonly result: GitRunResult,
  ) {
    super(message);
    this.name = "GitCommandError";
  }
}

/** 运行 git 命令;失败(code !== 0)抛 GitCommandError。 */
export async function runGit(
  args: string[],
  options: GitClientOptions = {},
  cwd?: string,
): Promise<GitRunResult> {
  const executable = options.executable ?? "git";
  const timeoutMs = options.timeoutMs ?? 60_000;

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
    // 提交身份:镜像提交由服务端统一署名,不依赖全局 git 配置。
    GIT_AUTHOR_NAME: "Atrium Data Mirror",
    GIT_AUTHOR_EMAIL: "data-mirror@atrium.local",
    GIT_COMMITTER_NAME: "Atrium Data Mirror",
    GIT_COMMITTER_EMAIL: "data-mirror@atrium.local",
    GIT_SSH_COMMAND: options.sshPrivateKeyPath
      ? `ssh -i "${options.sshPrivateKeyPath}" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o BatchMode=yes`
      : undefined,
    GIT_ASKPASS: options.askPassPath,
    ATRIUM_GIT_PAT: options.patEnv,
  };
  for (const key of Object.keys(env)) {
    if (env[key] === undefined) {
      delete env[key];
    }
  }

  const result = await new Promise<GitRunResult>((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(
        new Error(
          `git ${args[0] ?? ""} timed out after ${timeoutMs}ms`,
        ),
      );
    }, timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? -1 });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });

  if (result.code !== 0) {
    throw new GitCommandError(
      `git ${args.join(" ")} failed (${result.code}): ${result.stderr.trim()}`,
      args,
      result,
    );
  }
  return result;
}

/** 面向数据镜像流程的 Git 客户端(工作目录内操作)。 */
export class GitClient {
  constructor(
    private readonly workDir: string,
    private readonly options: GitClientOptions = {},
  ) {}

  async run(args: string[]): Promise<GitRunResult> {
    return runGit(args, this.options, this.workDir);
  }

  async init(): Promise<void> {
    await this.run(["init", "-b", "main"]);
  }

  async addRemote(name: string, url: string): Promise<void> {
    await this.run(["remote", "add", name, url]);
  }

  async fetch(remote: string, refspec?: string): Promise<void> {
    await this.run(["fetch", remote, ...(refspec ? [refspec] : [])]);
  }

  /** 本地是否已有该分支。 */
  async hasLocalBranch(branch: string): Promise<boolean> {
    try {
      await this.run(["rev-parse", "--verify", `refs/heads/${branch}`]);
      return true;
    } catch {
      return false;
    }
  }

  async checkout(branch: string): Promise<void> {
    await this.run(["checkout", "-B", branch]);
  }

  /** 基于指定起点创建/切换本地分支(如从远端分支建本地跟踪分支)。 */
  async checkoutStart(branch: string, startPoint: string): Promise<void> {
    await this.run(["checkout", "-B", branch, startPoint]);
  }

  /** 创建不基于任何提交的空分支(首次推送场景)。 */
  async checkoutOrphan(branch: string): Promise<void> {
    await this.run(["checkout", "--orphan", branch]);
  }

  /** 远程分支是否存在(通过 refs/remotes 判断)。 */
  async hasRemoteBranch(remote: string, branch: string): Promise<boolean> {
    try {
      await this.run(["rev-parse", "--verify", `refs/remotes/${remote}/${branch}`]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 检测本地分支与远程分支的相对关系(用于安全推送判定)。
   * 返回 "behind"(远程领先,可快进)、"ahead"(本地领先,可直接推送)、
   * "in-sync"(一致)、"none"(无本地提交)或 null(分叉,必须停止)。
   */
  async divergence(
    remote: string,
    branch: string,
  ): Promise<"behind" | "ahead" | "in-sync" | "none" | null> {
    const hasLocal = await this.hasLocalBranch(branch);
    if (!hasLocal) {
      return "none";
    }
    const local = (await this.run(["rev-parse", branch])).stdout.trim();
    const remoteRef = `refs/remotes/${remote}/${branch}`;
    const hasRemote = await this.hasRemoteBranch(remote, branch);
    if (!hasRemote) {
      // 本地分支存在但远端无该分支:视为可推送。
      return "ahead";
    }
    const remoteCommit = (await this.run(["rev-parse", remoteRef])).stdout.trim();
    if (local === remoteCommit) {
      return "in-sync";
    }
    const mergeBase = (
      await this.run(["merge-base", local, remoteRef])
    ).stdout.trim();
    if (mergeBase === remoteCommit) {
      return "ahead";
    }
    if (mergeBase === local) {
      return "behind";
    }
    return null;
  }

  async fastForward(branch: string): Promise<void> {
    await this.run(["merge", "--ff-only", `refs/remotes/origin/${branch}`]);
  }

  /** 工作区是否有未提交变化(porcelain 非空)。 */
  async hasChanges(): Promise<boolean> {
    const { stdout } = await this.run(["status", "--porcelain"]);
    return stdout.trim().length > 0;
  }

  async add(paths: string[]): Promise<void> {
    await this.run(["add", "--", ...paths]);
  }

  async commit(message: string): Promise<void> {
    await this.run(["commit", "-m", message]);
  }

  async push(remote: string, branch: string): Promise<void> {
    await this.run(["push", remote, `HEAD:${branch}`]);
  }

  /** 仅用于新建分支时提交首个文件。 */
  async createBranch(branch: string): Promise<void> {
    await this.run(["checkout", "--orphan", branch]);
  }
}
