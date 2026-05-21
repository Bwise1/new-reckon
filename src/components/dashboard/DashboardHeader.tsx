import { useAuthStore } from "@/stores/auth.store";
import Logo from "@/assets/images/logo.svg";
import { FiUser, FiLogOut } from "react-icons/fi";
import { useLogout } from "@/hooks/useAuth";

const DashboardHeader = () => {
  const user = useAuthStore((state) => state.user);
  const { mutate: logout, isPending: isLoading } = useLogout();

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
        <button
          onClick={logout}
          disabled={isLoading}
          className="w-10 h-10 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-red-500 transition-colors disabled:opacity-50"
          title="Logout"
        >
          <FiLogOut className="text-lg" />
        </button>
      </div>
    </header>
  );
};

export default DashboardHeader;
