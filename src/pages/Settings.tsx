import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiUser, FiLock, FiHardDrive, FiLogOut, FiTrash2,
  FiCamera, FiCheck, FiAlertCircle, FiChevronRight, FiArrowLeft,
} from "react-icons/fi";
import { useProfile, useUpdateProfile, useUploadProfilePicture, useChangePassword, useDeleteAccount } from "@/hooks/useProfile";
import { useStorage } from "@/hooks/useStorage";
import { useLogout } from "@/hooks/useAuth";
import { useConfirm } from "@/contexts/ConfirmProvider";
import DashboardLayout from "@/layouts/DashboardLayout";

const PROFESSIONS = [
  "Quantity Surveyor", "Architect", "Realtor", "Builder",
  "Engineer", "Estate Surveyor", "Others",
];
const LEVELS = ["Student", "Professional", "Others"];

type Section = "profile" | "password" | "storage" | null;

function StorageBar({ used, quota, percent }: { used: string; quota: string; percent: number }) {
  const color = percent >= 90 ? "bg-red-500" : percent >= 70 ? "bg-amber-500" : "bg-secondary";
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-gray-600">{used} used</span>
        <span className="text-gray-400">{quota}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
      <p className="text-xs text-gray-400">{percent}% of your storage used</p>
    </div>
  );
}

function Toast({ message, type, onDone }: { message: string; type: "success" | "error"; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${type === "success" ? "bg-gray-900" : "bg-red-500"}`}>
      {type === "success" ? <FiCheck className="shrink-0" /> : <FiAlertCircle className="shrink-0" />}
      {message}
    </div>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [activeSection, setActiveSection] = useState<Section>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const { data: profileData, isLoading: profileLoading } = useProfile();
  const { data: storageData } = useStorage();
  const { mutateAsync: updateProfile, isPending: savingProfile } = useUpdateProfile();
  const { mutateAsync: uploadPicture, isPending: uploadingPicture } = useUploadProfilePicture();
  const { mutateAsync: changePassword, isPending: savingPassword } = useChangePassword();
  const { mutateAsync: deleteAccount, isPending: deletingAccount } = useDeleteAccount();
  const { mutate: logout } = useLogout();

  const profile = profileData?.data?.user;
  const completion = profileData?.data?.profileCompletion ?? 0;
  const storage = storageData?.data;

  // Profile form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [profession, setProfession] = useState("");
  const [level, setLevel] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");

  // Password form state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const picInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile) {
      setFirstName(profile.firstName ?? "");
      setLastName(profile.lastName ?? "");
      setPhoneNumber(profile.phoneNumber ?? "");
      setProfession(profile.profession ?? "");
      setLevel(profile.level ?? "");
      setDateOfBirth(profile.dateOfBirth ?? "");
    }
  }, [profile]);

  const showToast = (message: string, type: "success" | "error") =>
    setToast({ message, type });

  const handleSaveProfile = async () => {
    try {
      await updateProfile({ firstName, lastName, phoneNumber, profession, level, dateOfBirth });
      showToast("Profile updated", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to update profile", "error");
    }
  };

  const handlePictureChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadPicture(file);
      showToast("Profile picture updated", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to upload picture", "error");
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      showToast("New passwords do not match", "error");
      return;
    }
    if (newPassword.length < 8) {
      showToast("Password must be at least 8 characters", "error");
      return;
    }
    try {
      await changePassword({ currentPassword, newPassword });
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      showToast("Password updated successfully", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to change password", "error");
    }
  };

  const handleDeleteAccount = async () => {
    const ok = await confirm({
      title: "Delete account?",
      message: (
        <p className="text-sm text-gray-600">
          This will permanently delete your account and all projects. This cannot be undone.
        </p>
      ),
      confirmLabel: "Delete my account",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await deleteAccount();
      logout();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to delete account", "error");
    }
  };

  const initials = [profile?.firstName?.[0], profile?.lastName?.[0]]
    .filter(Boolean).join("").toUpperCase() || profile?.email?.[0]?.toUpperCase() || "U";

  const isGoogleAccount = Boolean(profile?.googleLinked);
  const isAppleAccount = Boolean(profile?.appleLinked);
  const hasPassword = Boolean(profile?.hasPassword);
  const isSocialOnly = (isGoogleAccount || isAppleAccount) && !hasPassword;

  if (profileLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-6 h-6 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-xl mx-auto py-6 px-4">

        {/* Back / Header */}
        <div className="flex items-center gap-3 mb-8">
          {activeSection ? (
            <button
              onClick={() => setActiveSection(null)}
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-500"
            >
              <FiArrowLeft className="text-lg" />
            </button>
          ) : (
            <button
              onClick={() => navigate(-1)}
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-500"
            >
              <FiArrowLeft className="text-lg" />
            </button>
          )}
          <h1 className="text-lg font-semibold text-brandColor">
            {activeSection === "profile" ? "Edit Profile"
              : activeSection === "password" ? "Change Password"
              : activeSection === "storage" ? "Storage"
              : "Settings"}
          </h1>
        </div>

        {/* ── INDEX VIEW ── */}
        {!activeSection && (
          <div className="space-y-4">

            {/* Avatar + name card */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 flex items-center gap-4 shadow-sm">
              <div className="relative shrink-0">
                {profile?.profilePicture ? (
                  <img
                    src={profile.profilePicture}
                    alt="avatar"
                    className="w-16 h-16 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-brandGold flex items-center justify-center">
                    <span className="text-xl font-bold text-brandColor">{initials}</span>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-brandColor truncate">
                  {[profile?.firstName, profile?.lastName].filter(Boolean).join(" ") || "Complete your profile"}
                </p>
                <p className="text-sm text-gray-400 truncate">{profile?.email}</p>
                {/* Profile completion bar */}
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brandGold rounded-full"
                      style={{ width: `${completion}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">{completion}%</span>
                </div>
              </div>
            </div>

            {/* Linked accounts badges */}
            {(isGoogleAccount || isAppleAccount) && (
              <div className="flex gap-2 px-1">
                {isGoogleAccount && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                    Google linked
                  </span>
                )}
                {isAppleAccount && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
                    Apple linked
                  </span>
                )}
              </div>
            )}

            {/* Storage mini-bar */}
            {storage && (
              <div
                className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm cursor-pointer hover:border-gray-200 transition-colors"
                onClick={() => setActiveSection("storage")}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FiHardDrive className="text-secondary" />
                    <span className="text-sm font-medium text-gray-700">Storage</span>
                  </div>
                  <FiChevronRight className="text-gray-400 text-sm" />
                </div>
                <StorageBar
                  used={storage.used_formatted}
                  quota={storage.quota_formatted}
                  percent={storage.percent_used}
                />
              </div>
            )}

            {/* Nav items */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {[
                { id: "profile" as Section, icon: <FiUser />, label: "Edit Profile" },
                ...(!isSocialOnly ? [{ id: "password" as Section, icon: <FiLock />, label: "Change Password" }] : []),
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className="w-full flex items-center gap-3 px-5 py-4 text-sm text-gray-700 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0"
                >
                  <span className="text-secondary">{item.icon}</span>
                  <span className="flex-1 text-left font-medium">{item.label}</span>
                  <FiChevronRight className="text-gray-400" />
                </button>
              ))}
            </div>

            {/* Danger zone */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <button
                onClick={() => logout()}
                className="w-full flex items-center gap-3 px-5 py-4 text-sm text-gray-700 hover:bg-gray-50 transition-colors border-b border-gray-100"
              >
                <FiLogOut className="text-gray-500" />
                <span className="flex-1 text-left font-medium">Log out</span>
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deletingAccount}
                className="w-full flex items-center gap-3 px-5 py-4 text-sm text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                <FiTrash2 />
                <span className="flex-1 text-left font-medium">Delete Account</span>
              </button>
            </div>
          </div>
        )}

        {/* ── PROFILE SECTION ── */}
        {activeSection === "profile" && (
          <div className="space-y-5">
            {/* Avatar */}
            <div className="flex flex-col items-center gap-3 pb-2">
              <div className="relative">
                {profile?.profilePicture ? (
                  <img
                    src={profile.profilePicture}
                    alt="avatar"
                    className="w-20 h-20 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-brandGold flex items-center justify-center">
                    <span className="text-2xl font-bold text-brandColor">{initials}</span>
                  </div>
                )}
                <button
                  onClick={() => picInputRef.current?.click()}
                  disabled={uploadingPicture}
                  className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-secondary flex items-center justify-center shadow-md disabled:opacity-50"
                >
                  {uploadingPicture
                    ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                    : <FiCamera className="text-white text-xs" />}
                </button>
                <input
                  ref={picInputRef}
                  type="file"
                  accept="image/jpeg,image/png"
                  className="hidden"
                  onChange={handlePictureChange}
                />
              </div>
              <p className="text-xs text-gray-400">Tap to change photo</p>
            </div>

            {/* Fields */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1.5 block">First Name</label>
                  <input
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    placeholder="First name"
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-secondary placeholder-gray-300"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1.5 block">Last Name</label>
                  <input
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    placeholder="Last name"
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-secondary placeholder-gray-300"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1.5 block">Email</label>
                <input
                  value={profile?.email ?? ""}
                  disabled
                  className="w-full px-3 py-2.5 text-sm border border-gray-100 rounded-lg bg-gray-50 text-gray-400 cursor-not-allowed"
                />
                {(isGoogleAccount || isAppleAccount) && (
                  <p className="text-xs text-gray-400 mt-1">
                    Signed in with {isGoogleAccount ? "Google" : "Apple"} — email cannot be changed
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1.5 block">Phone Number</label>
                <input
                  value={phoneNumber}
                  onChange={e => setPhoneNumber(e.target.value)}
                  type="tel"
                  placeholder="+234 000 000 0000"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-secondary placeholder-gray-300"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1.5 block">Date of Birth</label>
                <input
                  value={dateOfBirth}
                  onChange={e => setDateOfBirth(e.target.value)}
                  type="date"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-secondary text-gray-700"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1.5 block">Profession</label>
                <select
                  value={profession}
                  onChange={e => setProfession(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-secondary text-gray-700 bg-white"
                >
                  <option value="">Select profession</option>
                  {PROFESSIONS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1.5 block">Level</label>
                <select
                  value={level}
                  onChange={e => setLevel(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-secondary text-gray-700 bg-white"
                >
                  <option value="">Select level</option>
                  {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>

            <button
              onClick={handleSaveProfile}
              disabled={savingProfile}
              className="w-full py-3 bg-secondary text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {savingProfile
                ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving…</>
                : "Save Changes"}
            </button>
          </div>
        )}

        {/* ── PASSWORD SECTION ── */}
        {activeSection === "password" && (
          <div className="space-y-5">
            {isSocialOnly ? (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-sm text-amber-800">
                Your account uses {isGoogleAccount ? "Google" : "Apple"} sign-in. Password management is handled by your {isGoogleAccount ? "Google" : "Apple"} account.
              </div>
            ) : (
              <>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1.5 block">Current Password</label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={e => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                      className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-secondary placeholder-gray-300"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1.5 block">New Password</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-secondary placeholder-gray-300"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1.5 block">Confirm New Password</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="Repeat new password"
                      className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-secondary placeholder-gray-300"
                    />
                  </div>
                </div>

                <button
                  onClick={handleChangePassword}
                  disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}
                  className="w-full py-3 bg-secondary text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {savingPassword
                    ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Updating…</>
                    : "Update Password"}
                </button>
              </>
            )}
          </div>
        )}

        {/* ── STORAGE SECTION ── */}
        {activeSection === "storage" && (
          <div className="space-y-5">
            {storage ? (
              <>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-2xl font-bold text-brandColor">{storage.used_formatted}</p>
                      <p className="text-sm text-gray-400 mt-0.5">of {storage.quota_formatted} used</p>
                    </div>
                    <div className="w-14 h-14 rounded-full border-4 border-gray-100 flex items-center justify-center relative">
                      <svg className="absolute inset-0 w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                        <circle cx="28" cy="28" r="22" fill="none" stroke="#f3f4f6" strokeWidth="4" />
                        <circle
                          cx="28" cy="28" r="22" fill="none"
                          stroke={storage.percent_used >= 90 ? "#ef4444" : storage.percent_used >= 70 ? "#f59e0b" : "#003566"}
                          strokeWidth="4"
                          strokeDasharray={`${2 * Math.PI * 22}`}
                          strokeDashoffset={`${2 * Math.PI * 22 * (1 - storage.percent_used / 100)}`}
                          strokeLinecap="round"
                        />
                      </svg>
                      <span className="text-xs font-bold text-brandColor z-10">{storage.percent_used}%</span>
                    </div>
                  </div>

                  <StorageBar
                    used={storage.used_formatted}
                    quota={storage.quota_formatted}
                    percent={storage.percent_used}
                  />

                  {storage.percent_used >= 90 && (
                    <div className="flex items-start gap-2.5 bg-red-50 border border-red-100 rounded-xl p-3.5 text-sm text-red-700">
                      <FiAlertCircle className="shrink-0 mt-0.5" />
                      <span>You're almost out of storage. Delete unused plans to free up space.</span>
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Breakdown</p>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Plan files (PDFs & images)</span>
                    <span className="font-medium text-brandColor">{storage.used_formatted}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Available</span>
                    <span className="font-medium text-gray-500">
                      {storage.available_bytes === null ? "Unlimited" : storage.quota_formatted.replace(storage.used_formatted, "")}
                      {storage.available_bytes !== null && (() => {
                        const avail = storage.quota_bytes - storage.used_bytes;
                        if (avail >= 1_073_741_824) return ` ${(avail / 1_073_741_824).toFixed(1)} GB`;
                        if (avail >= 1_048_576) return ` ${(avail / 1_048_576).toFixed(1)} MB`;
                        return ` ${(avail / 1_024).toFixed(1)} KB`;
                      })()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Your plan</span>
                    <span className="font-medium text-brandColor">Free (500 MB)</span>
                  </div>
                </div>

                <p className="text-xs text-center text-gray-400 px-4">
                  Storage is counted from your uploaded PDF and image plan files. Upgrade your plan to get more storage.
                </p>
              </>
            ) : (
              <div className="flex items-center justify-center py-16">
                <div className="w-6 h-6 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
        )}
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDone={() => setToast(null)}
        />
      )}
    </DashboardLayout>
  );
}
