import type { LoginRequest } from "../types/loginRequest";
import type { AuthState } from "../types/authState";
import { signInWithEmailAndPassword } from "firebase/auth";
import { get, ref } from "firebase/database";
import {
  firebaseAuth,
  firebaseDatabase,
  requireFirebaseConfiguration,
} from "../../../lib/firebase";

type UserProfile = Partial<
  Pick<
    AuthState,
    | "firstName"
    | "lastName"
    | "middleName"
    | "extension"
    | "dateOfBirth"
    | "roles"
  >
> & { role?: string };

class AuthService {
  async login(request: LoginRequest): Promise<AuthState> {
    requireFirebaseConfiguration();
    const credential = await signInWithEmailAndPassword(
      firebaseAuth,
      request.email,
      request.password,
    );
    const [token, tokenResult, profileSnapshot] = await Promise.all([
      credential.user.getIdToken(),
      credential.user.getIdTokenResult(),
      get(ref(firebaseDatabase, `users/${credential.user.uid}`)),
    ]);
    const profile = profileSnapshot.exists()
      ? (profileSnapshot.val() as UserProfile)
      : {};
    const claimRole = tokenResult.claims.role;
    const roles = profile.roles?.length
      ? profile.roles
      : [profile.role || (typeof claimRole === "string" ? claimRole : "teacher")];

    return {
      id: credential.user.uid,
      username: credential.user.email || request.email,
      firstName: profile.firstName || "ASTIG",
      lastName: profile.lastName || "User",
      middleName: profile.middleName || null,
      extension: profile.extension || null,
      dateOfBirth: profile.dateOfBirth || "",
      jwtToken: token,
      roles,
    };
  }
}

export const authService = new AuthService();
