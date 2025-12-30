import type { ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import ReckonLogo from '@/assets/images/logo.svg';
import OnboardingBg from '@/assets/images/Onboardingpage.jpg';

interface AuthLayoutProps {
  children: ReactNode;
}

const AuthLayout = ({ children }: AuthLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();

  const isLoginPage = location.pathname === '/login' || location.pathname === '/';
  const isSignupPage = location.pathname === '/signup';

  return (
    <div className="h-screen overflow-hidden relative">
      <div className="container h-screen flex items-center px-20 mx-auto">
        {/* Left Side - Branding */}
        <div
          className="w-2/4 h-[90vh] flex flex-col justify-between rounded-lg overflow-hidden p-12 z-50"
          style={{
            backgroundImage: `url(${OnboardingBg})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        >
          {/* Top */}
          <div className="text-white">
            <p className="text-2xl font-normal">Welcome to Reckon.</p>
          </div>

          {/* Center - Logo */}
          <div className="flex-1 flex flex-col justify-center items-center">
            <img src={ReckonLogo} className="h-28 w-24" alt="Reckon Logo" />
          </div>

          {/* Bottom */}
          <div className="text-white text-center">
            <p className="text-xl font-normal leading-relaxed">
              The construction cost management app
              <br />
              trusted by builders.
            </p>
          </div>
        </div>

        {/* Right Side - Auth Form */}
        <div className="w-2/4 h-[90vh] relative p-16 flex flex-col">
          <div>
            {/* Tab Navigation */}
            <div className="flex flex-row items-center mb-8 border-b border-gray-200">
              <button
                className={`flex-1 text-base font-normal pb-4 transition-colors text-center ${
                  isLoginPage
                    ? "border-black border-b-2 text-black"
                    : "text-[#B2B2B2] hover:text-black"
                }`}
                onClick={() => navigate('/login')}
              >
                Log In
              </button>

              <button
                className={`flex-1 text-base font-normal pb-4 transition-colors text-center ${
                  isSignupPage
                    ? "border-black border-b-2 text-black"
                    : "text-[#B2B2B2] hover:text-black"
                }`}
                onClick={() => navigate('/signup')}
              >
                Create Account
              </button>
            </div>

            {/* Auth Form Content */}
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;
