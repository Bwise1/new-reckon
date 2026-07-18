import { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth.store";
import Logo from "@/assets/images/logo_blue.svg";
import { FiUser, FiLogOut } from "react-icons/fi";
import { useLogout } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";

const DashboardHeader = () => {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const { mutate: logout, isPending: isLoading } = useLogout();
  const { data: profileData } = useProfile();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const profile = profileData?.data?.user;
  const initials = [profile?.firstName?.[0], profile?.lastName?.[0]]
    .filter(Boolean).join("").toUpperCase() || user?.name?.[0]?.toUpperCase() || "U";

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <header className="flex items-center justify-between py-6 px-8 bg-white border-b border-gray-200">
      {/* Left: logo + wordmark */}
      <div className="flex items-center gap-2.5">
        <img src={Logo} alt="Reckon" className="h-8" />
        <span className="text-base font-semibold text-brandColor tracking-tight">Reckon</span>
      </div>

      {/* Right: avatar with dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-10 h-10 rounded-full overflow-hidden ring-2 ring-transparent hover:ring-brandGold transition-all focus:outline-none"
        >
          {profile?.profilePicture ? (
            <img src={profile.profilePicture} alt="avatar" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-brandGold flex items-center justify-center">
              <span className="text-sm font-bold text-brandColor">{initials}</span>
            </div>
          )}
        </button>

        {open && (
          <div className="absolute right-0 mt-2 w-44 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-50">
            <button
              onClick={() => { setOpen(false); navigate("/settings"); }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <FiUser className="text-gray-400" />
              My Profile
            </button>
            <div className="h-px bg-gray-100 mx-2" />
            <button
              onClick={() => { setOpen(false); logout(); }}
              disabled={isLoading}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              <FiLogOut className="text-red-400" />
              Log out
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default DashboardHeader;
