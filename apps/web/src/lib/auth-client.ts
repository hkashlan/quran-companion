import { emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
	baseURL:
		typeof window !== "undefined"
			? window.location.origin
			: import.meta.env.VITE_BETTER_AUTH_URL,
	plugins: [emailOTPClient()],
});

export const {
	signIn,
	signUp,
	signOut,
	useSession,
	emailOtp,
	forgetPassword,
	changePassword,
} = authClient;
