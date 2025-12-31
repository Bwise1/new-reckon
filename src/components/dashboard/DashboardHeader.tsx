import { useAuthStore } from "@/stores/auth.store";
import Logo from "@/assets/images/logo.svg";
import { FiUser } from "react-icons/fi";

const DashboardHeader = () => {
  const user = useAuthStore((state) => state.user);

  return (
    <header className="flex items-center justify-between py-6 px-8 bg-white border-b border-gray-200">
      <div className="flex items-center">
        <img src={Logo} alt="Reckonio" className="h-8" />
      </div>

      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-sm font-medium text-brandColor">
            {user?.name || user?.email || "User"}
          </p>
        </div>
        <div className="w-10 h-10 rounded-full bg-brandGold flex items-center justify-center">
          <FiUser className="text-brandColor text-lg" />
        </div>
      </div>
    </header>
  );
};

export default DashboardHeader;
