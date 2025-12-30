import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import PasswordInput from "@/components/ui/PasswordInput";
import GoogleIcon from "@/assets/images/google.png";
import AppleIcon from "@/assets/images/apple.png";
import AuthLayout from "@/layouts/AuthLayout";
import { useSignup } from "@/hooks/useAuth";
import { validateEmail, validatePassword } from "@/utils/validation";

const Signup = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const navigate = useNavigate();

  const { mutate: signup, isPending, error } = useSignup();

  const handleSignup = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setValidationError(null);

    // Validation
    if (!validateEmail(email)) {
      setValidationError("Please enter a valid email address");
      return;
    }

    if (!validatePassword(password)) {
      setValidationError("Password must be at least 8 characters long");
      return;
    }

    signup({ email, password });
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

      <form onSubmit={handleSignup}>
        <div>
          <label htmlFor="email" className="font-medium text-sm">
            Email Address
          </label>
          <input
            type="email"
            id="email"
            className="input-box font-normal text-[#8C8787] w-full mt-1"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        {(error || validationError) && (
          <div className="text-red-500 text-sm font-medium mb-2">
            {validationError || error?.message}
          </div>
        )}

        <div>
          <label htmlFor="password" className="font-medium text-sm">
            Password
          </label>
          <PasswordInput
            className="w-full font-normal mt-1"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <p className="text-xs font-normal text-[#636363] mt-1">
            • Password must be at least 8 characters long
          </p>
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
            {isPending ? "Creating Account..." : "Create Account"}
          </button>
        </div>
      </form>
    </AuthLayout>
  );
};

export default Signup;
