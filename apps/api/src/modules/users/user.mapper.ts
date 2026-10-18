import type { User } from "@prosolution/db";
import type { UserDto } from "@prosolution/shared";

/** The only way a User leaves the API. Never includes the password hash or lockout internals. */
export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}
