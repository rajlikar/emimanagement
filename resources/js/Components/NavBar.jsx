import ApplicationLogo from '@/Components/ApplicationLogo';
import Dropdown from '@/Components/Dropdown';
import NavLink from '@/Components/NavLink';
import ResponsiveNavLink from '@/Components/ResponsiveNavLink';
import { Link, usePage } from '@inertiajs/react';
import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faTachometerAlt,
  faHandHoldingUsd,
  faUserCircle,
  faSignOutAlt,
  faSun,
  faMoon
} from "@fortawesome/free-solid-svg-icons";
import Logo from './Logo';
import IfSignupsOpen from '@/Components/IfSignupsOpen';

export default function NavBar() {
  const { auth } = usePage().props;
  const user = auth?.user;
  const [showingNavigationDropdown, setShowingNavigationDropdown] = useState(false);

  // Theme Toggle Logic
  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme) return savedTheme;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light'; // Default
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  return (
    <nav className="fixed top-0 w-full z-50 bg-white/70 dark:bg-gray-900/70 backdrop-blur-lg border-b border-gray-100 dark:border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-20 items-center">
          <div className="flex items-center gap-3">
            <Logo />

            {user && (
              <div className="hidden space-x-1 sm:-my-px sm:ms-10 sm:flex">
                <NavLink
                  href={route("dashboard")}
                  active={route().current("dashboard")}
                  className="px-4 transition-all duration-200"
                >
                  <FontAwesomeIcon icon={faTachometerAlt} className="mr-2 opacity-70" />
                  Dashboard
                </NavLink>
                <NavLink
                  href={route("loan-detail.index")}
                  active={route().current("loan-detail.index")}
                  className="px-4 transition-all duration-200"
                >
                  <FontAwesomeIcon icon={faHandHoldingUsd} className="mr-2 opacity-70" />
                  Loans
                </NavLink>
              </div>
            )}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-4">
            {/* Theme Toggle */}
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="p-2 rounded-xl text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors"
              aria-label="Toggle Dark Mode"
            >
              <FontAwesomeIcon icon={theme === "dark" ? faSun : faMoon} className="text-xl" />
            </button>

            {user ? (
              <div className="hidden sm:flex sm:items-center">
                <div className="relative ms-3">
                  <Dropdown>
                    <Dropdown.Trigger>
                      <span className="inline-flex rounded-md">
                        <button
                          type="button"
                          className="inline-flex items-center rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50 px-4 py-2 text-sm font-bold leading-4 text-gray-700 transition duration-200 hover:bg-white dark:hover:bg-gray-800 focus:outline-none dark:text-gray-300"
                        >
                          <div className="w-6 h-6 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center justify-center text-[10px] text-white mr-2 shadow-sm font-black">
                            {user.name?.charAt(0)}
                          </div>
                          {user.name}

                          <svg
                            className="-me-0.5 ms-2 h-4 w-4 opacity-50 transition-transform group-hover:rotate-180"
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path
                              fillRule="evenodd"
                              d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </button>
                      </span>
                    </Dropdown.Trigger>

                    <Dropdown.Content>
                      <Dropdown.Link href={route("profile.edit")} className="flex items-center">
                        <FontAwesomeIcon icon={faUserCircle} className="mr-2 opacity-70" />
                        My Profile
                      </Dropdown.Link>
                      <Dropdown.Link
                        href={route("logout")}
                        method="post"
                        as="button"
                        className="flex items-center text-red-600 dark:text-red-400"
                      >
                        <FontAwesomeIcon icon={faSignOutAlt} className="mr-2 opacity-70" />
                        Sign Out
                      </Dropdown.Link>
                    </Dropdown.Content>
                  </Dropdown>
                </div>
              </div>
            ) : (
              <>
                <Link
                  href={route('login')}
                  className="text-sm font-bold text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                >
                  Log In
                </Link>
                <IfSignupsOpen>
                  <Link
                    href={route('register')}
                    className="px-6 py-2.5 rounded-xl bg-indigo-600 text-white font-bold transition-all hover:bg-indigo-700 hover:shadow-lg active:scale-95"
                  >
                    Get Started
                  </Link>
                </IfSignupsOpen>
              </>
            )}

            {/* Mobile toggle */}
            {user && (
              <div className="-me-2 flex items-center sm:hidden">
                <button
                  onClick={() => setShowingNavigationDropdown((prev) => !prev)}
                  className="inline-flex items-center justify-center rounded-md p-2 text-gray-400 transition duration-150 ease-in-out hover:bg-gray-100 hover:text-gray-500 focus:bg-gray-100 focus:text-gray-500 focus:outline-none dark:text-gray-500 dark:hover:bg-gray-900 dark:hover:text-gray-400 dark:focus:bg-gray-900 dark:focus:text-gray-400"
                >
                  <svg className="h-6 w-6" stroke="currentColor" fill="none" viewBox="0 0 24 24">
                    <path
                      className={!showingNavigationDropdown ? 'inline-flex' : 'hidden'}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M4 6h16M4 12h16M4 18h16"
                    />
                    <path
                      className={showingNavigationDropdown ? 'inline-flex' : 'hidden'}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile menu for authenticated */}
      {user && (
        <div className={(showingNavigationDropdown ? 'block' : 'hidden') + ' sm:hidden'}>
          <div className="space-y-1 pb-3 pt-2">
            <ResponsiveNavLink href={route('dashboard')} active={route().current('dashboard')}>
              Dashboard
            </ResponsiveNavLink>
            <ResponsiveNavLink href={route('loan-detail.index')} active={route().current('loan-detail.index')}>
              Loans
            </ResponsiveNavLink>
          </div>

          <div className="border-t border-gray-200 pb-1 pt-4 dark:border-gray-600">
            <div className="px-4">
              <div className="text-base font-medium text-gray-800 dark:text-gray-200">{user.name}</div>
              <div className="text-sm font-medium text-gray-500">{user.email}</div>
            </div>

            <div className="mt-3 space-y-1">
              <ResponsiveNavLink href={route('profile.edit')}>Profile</ResponsiveNavLink>
              <ResponsiveNavLink method="post" href={route('logout')} as="button">
                Log Out
              </ResponsiveNavLink>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
