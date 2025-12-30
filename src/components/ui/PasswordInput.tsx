import { useState } from 'react';
import { FaRegEye, FaRegEyeSlash } from "react-icons/fa6";

interface PasswordInputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
}

const PasswordInput = ({
  value,
  onChange,
  placeholder,
  className = "",
  required = false
}: PasswordInputProps) => {
  const [isShowPassword, setIsShowPassword] = useState(false);

  const toggleShowPassword = () => {
    setIsShowPassword(!isShowPassword);
  };

  return (
    <div className={`flex items-center w-full border border-primary rounded-lg px-2 py-1 focus-within:border-secondary mb-2 ${className}`}>
      <input
        value={value}
        onChange={onChange}
        type={isShowPassword ? "text" : "password"}
        placeholder={placeholder || "Enter your password"}
        className="w-full text-sm font-normal text-[#8C8787] px-3 py-2 outline-none focus:outline-none bg-transparent"
        aria-label={isShowPassword ? "Hide password" : "Show password"}
        required={required}
      />

      {isShowPassword ? (
        <FaRegEye
          size={18}
          className="text-secondary cursor-pointer ml-2 flex-shrink-0"
          onClick={toggleShowPassword}
        />
      ) : (
        <FaRegEyeSlash
          size={18}
          className="text-slate-400 cursor-pointer ml-2 flex-shrink-0"
          onClick={toggleShowPassword}
        />
      )}
    </div>
  );
};

export default PasswordInput;
