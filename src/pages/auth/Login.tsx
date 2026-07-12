import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import PasswordInput from "@/components/ui/PasswordInput";
import GoogleIcon from "@/assets/images/google.png";
import AppleIcon from "@/assets/images/apple.png";
import AuthLayout from "@/layouts/AuthLayout";
import { useLogin } from "@/hooks/useAuth";
import { validateEmail } from "@/utils/validation";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const navigate = useNavigate();

  const { mutate: login, isPending, error } = useLogin();

  useEffect(() => {
    const notice = sessionStorage.getItem("reckon_auth_notice");
    if (notice) {
      setSessionNotice(notice);
      sessionStorage.removeItem("reckon_auth_notice");
    }
  }, []);

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!validateEmail(email)) {
      return;
    }

    login({ email, password });
  };

  return (
    <AuthLayout>
      <div className="flex flex-col gap-3">
        <button
          type="button"
          className="w-full border border-gray-300 rounded-lg px-4 py-3 font-normal text-sm flex items-center justify-center hover:bg-gray-50 transition-colors"
        >
          <img src={GoogleIcon} className="h-5 w-5 mr-3" alt="Google" />
          Continue with Google
        </button>
        <button
          type="button"
          className="w-full border border-gray-300 rounded-lg px-4 py-3 font-normal text-sm flex items-center justify-center hover:bg-gray-50 transition-colors"
        >
          <img src={AppleIcon} className="h-5 w-5 mr-3" alt="Apple" />
          Continue with Apple
        </button>
      </div>

      <div className="my-6 grid grid-cols-3 items-center gap-4">
        <hr className="border-gray-300" />
        <p className="text-center font-normal text-sm text-[#616161]">
          Or set up with email
        </p>
        <hr className="border-gray-300" />
      </div>

      <form onSubmit={handleLogin}>
        {sessionNotice && (
          <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {sessionNotice}
          </div>
        )}
        <div>
          <label htmlFor="email" className="font-medium text-sm">
            Email Address
          </label>
          <input
            type="email"
            id="email"
            className="input-box text-[#8C8787] font-normal w-full mt-1"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        {error && (
          <div className="text-red-500 text-sm font-medium mb-2">
            {error.message}
          </div>
        )}

        <div>
          <label htmlFor="password" className="font-medium text-sm">
            Password
          </label>
          <PasswordInput
            className="w-full mt-1"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <div className="flex flex-row justify-between font-medium text-[#8C8787] text-sm">
            <div className="gap-2 flex items-center">
              <input
                type="checkbox"
                id="remember"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="cursor-pointer"
              />
              <label htmlFor="remember" className="cursor-pointer">
                Remember Me
              </label>
            </div>
            <button
              type="button"
              className="underline hover:text-secondary transition-colors"
              onClick={() => navigate("/forgot-password")}
            >
              Forgot Password?
            </button>
          </div>
        </div>

        <p className="text-[#8C8787] font-normal text-center mt-4 text-xs">
          By creating an account, you agree with our{" "}
          <span className="underline text-[#616161] cursor-pointer hover:text-secondary transition-colors">
            Terms of Service
          </span>{" "}
          and{" "}
          <span className="underline text-[#616161] cursor-pointer hover:text-secondary transition-colors">
            Privacy Policy
          </span>.
        </p>

        <div>
          <button
            type="submit"
            className={`btn-primary font-bold text-lg ${
              isPending ? "opacity-50 cursor-not-allowed" : ""
            }`}
            disabled={isPending}
          >
            {isPending ? "Logging in..." : "Log In"}
          </button>
        </div>
      </form>
    </AuthLayout>
  );
};

export default Login;
