/**
 * 认证上下文(PRD §19.1 / AGENTS §13)。
 * 挂载时通过 GET /api/core/auth/me 恢复会话;login / logout / challengeAdmin
 * 分别调用 /api/core/auth/* 接口。任何认证接口返回 401 时状态置为 anonymous。
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { ApiError, createApiClient, type ApiClient } from "./api-client.js";

export type AuthStatus = "loading" | "authenticated" | "anonymous";

export interface AuthContextValue {
  status: AuthStatus;
  /** 当前认证的 profile id;未认证为 null。 */
  profileId: string | null;
  login(password: string): Promise<{ profileId: string }>;
  logout(): Promise<void>;
  /** 敏感操作的管理员口令校验;返回是否通过。 */
  challengeAdmin(password: string): Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export interface AuthProviderProps {
  /** 缺省时使用同源 /api 根。 */
  apiClient?: ApiClient;
  children: ReactNode;
}

export function AuthProvider({ apiClient, children }: AuthProviderProps) {
  const client = useMemo(() => apiClient ?? createApiClient(""), [apiClient]);
  const [state, setState] = useState<{
    status: AuthStatus;
    profileId: string | null;
  }>({ status: "loading", profileId: null });

  useEffect(() => {
    let cancelled = false;
    client
      .get<{ authenticated: boolean; profileId: string | null }>(
        "/api/core/auth/me",
      )
      .then(
        (result) => {
          if (!cancelled) {
            // me 总是 200,以 authenticated 字段表达登录态(PRD §15)。
            if (result.authenticated) {
              setState({
                status: "authenticated",
                profileId: result.profileId,
              });
            } else {
              setState({ status: "anonymous", profileId: null });
            }
          }
        },
        () => {
          // 401(以及网络失败等)一律视为未认证,避免卡在 loading。
          if (!cancelled) {
            setState({ status: "anonymous", profileId: null });
          }
        }
      );
    return () => {
      cancelled = true;
    };
  }, [client]);

  const login = useCallback(
    async (password: string) => {
      try {
        const result = await client.post<{ profileId: string }>(
          "/api/core/auth/login",
          { password }
        );
        setState({ status: "authenticated", profileId: result.profileId });
        return result;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          setState({ status: "anonymous", profileId: null });
        }
        throw error;
      }
    },
    [client]
  );

  const logout = useCallback(async () => {
    try {
      await client.post<unknown>("/api/core/auth/logout", {});
    } finally {
      setState({ status: "anonymous", profileId: null });
    }
  }, [client]);

  const challengeAdmin = useCallback(
    async (password: string) => {
      try {
        const result = await client.post<{ verified: boolean }>(
          "/api/core/auth/admin-challenge",
          { password }
        );
        return result.verified;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          setState({ status: "anonymous", profileId: null });
        }
        throw error;
      }
    },
    [client]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status: state.status,
      profileId: state.profileId,
      login,
      logout,
      challengeAdmin,
    }),
    [state.status, state.profileId, login, logout, challengeAdmin]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === null) {
    throw new Error("useAuth 必须在 <AuthProvider> 内使用");
  }
  return value;
}
