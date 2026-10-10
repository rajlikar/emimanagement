import { Head, Link, usePage } from '@inertiajs/react';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faWallet, faArrowLeft, faShieldAlt, faLock, faUserShield } from "@fortawesome/free-solid-svg-icons";
import Logo from '@/Components/Logo';

export default function Privacy({ auth }) {
  const { contactEmail } = usePage().props;
  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0F172A] selection:bg-indigo-500 selection:text-white">
      <Head title="Privacy Policy - EMIPro" />

      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-white/70 dark:bg-gray-900/70 backdrop-blur-lg border-b border-gray-100 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-20 items-center">
            {/* <div className="flex items-center gap-2">
              <img src="/logo/emipro_logo.png" alt="EMIPro Logo" className="h-8 w-auto rounded-md shadow-sm" />
              <span className="text-xl font-black tracking-tight text-gray-900 dark:text-white">
                EMI<span className="text-indigo-600">Pro</span>
              </span>
            </div> */}
            <Logo />
            <div className="flex items-center gap-4">
              <Link
                href={route('welcome')}
                className="text-sm font-bold text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex items-center gap-2"
              >
                <FontAwesomeIcon icon={faArrowLeft} />
                Back to Home
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="relative pt-32 pb-20 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-3xl mb-6 shadow-xl shadow-indigo-200 dark:shadow-indigo-900/40">
              <FontAwesomeIcon icon={faShieldAlt} className="text-3xl text-white" />
            </div>
            <h1 className="text-5xl lg:text-6xl font-black text-gray-900 dark:text-white mb-4 tracking-tight">
              Privacy <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">Policy</span>
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>

          {/* Content Sections */}
          <div className="space-y-8">
            <section className="p-8 rounded-3xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                  <FontAwesomeIcon icon={faLock} className="text-blue-600 dark:text-blue-400" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Information We Collect</h2>
              </div>
              <div className="text-gray-600 dark:text-gray-400 space-y-4">
                <p>
                  At EMIPro, we take your privacy seriously. We collect information that you provide directly to us when you:
                </p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>Sign in to your account</li>
                  <li>Add loan information and EMI details</li>
                  <li>Contact our support team</li>
                </ul>
                <p>
                  This information may include your name, email address, and the financial details and documents you add about your loans and EMI payments.
                </p>
              </div>
            </section>

            <section className="p-8 rounded-3xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-purple-50 dark:bg-purple-900/30 rounded-xl flex items-center justify-center">
                  <FontAwesomeIcon icon={faUserShield} className="text-purple-600 dark:text-purple-400" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">How We Use Your Information</h2>
              </div>
              <div className="text-gray-600 dark:text-gray-400 space-y-4">
                <p>
                  We use the information we collect to:
                </p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>Provide and maintain the EMI tracking service</li>
                  <li>Send you payment reminders and notifications</li>
                  <li>Respond to your comments, questions, and customer service requests</li>
                  <li>Show you totals and what is due next</li>
                  <li>Protect against fraudulent or illegal activity</li>
                  <li>Comply with legal obligations and enforce our terms of service</li>
                </ul>
              </div>
            </section>

            <section className="p-8 rounded-3xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-green-50 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
                  <FontAwesomeIcon icon={faShieldAlt} className="text-green-600 dark:text-green-400" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Data Security</h2>
              </div>
              <div className="text-gray-600 dark:text-gray-400 space-y-4">
                <p>
                  What is actually in place:
                </p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>All traffic is encrypted in transit over HTTPS</li>
                  <li>Data and uploaded documents are stored on Google Cloud, which encrypts stored data at rest</li>
                  <li>Each account can only see its own loans and documents; uploaded documents are served only to their owner after sign-in</li>
                  <li>Passwords are stored hashed, and sign-in is limited to approved accounts</li>
                </ul>
                <p className="font-semibold text-gray-900 dark:text-white">
                  While we strive to protect your personal information, no method of transmission over the Internet is 100% secure. We cannot guarantee absolute security.
                </p>
              </div>
            </section>

            <section className="p-8 rounded-3xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Your Rights</h2>
              <div className="text-gray-600 dark:text-gray-400 space-y-4">
                <p>
                  You have the right to:
                </p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>Access and review your personal information</li>
                  <li>Request corrections to inaccurate data</li>
                  <li>Delete your account and associated data</li>
                  <li>Ask for a copy of your data</li>
                </ul>
              </div>
            </section>

            <section className="p-8 rounded-3xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Where your data is kept, and for how long</h2>
              <div className="text-gray-600 dark:text-gray-400 space-y-4">
                <p>
                  This is a private tool and accounts are limited to approved users. Your data is hosted on Google Cloud (Singapore region). We use Google for hosting and for Google sign-in, and Gmail to send password-reset and reminder emails. Loan payments are never collected through this app.
                </p>
                <p>
                  When you delete a document, a loan, or your account, the data and the stored files are deleted. Short-lived copies can remain in system backups for up to about 24 hours, and in cloud storage trash for up to about 7 days, before they are permanently removed.
                </p>
              </div>
            </section>

            <section className="p-8 rounded-3xl bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border border-indigo-100 dark:border-indigo-800">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Contact Us</h2>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                If you have any questions about this Privacy Policy, please contact us at:
              </p>
              <div className="space-y-2 text-gray-900 dark:text-white font-semibold">
                {contactEmail ? (
                  <p>Email: <a href={`mailto:${contactEmail}`} className="text-indigo-600 dark:text-indigo-400 hover:underline">{contactEmail}</a></p>
                ) : (
                  <p>Please contact the site owner directly.</p>
                )}
              </div>
            </section>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 dark:border-gray-800 py-12 px-4 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          {/* <div className="flex items-center gap-2">
            <img src="/logo/emipro_logo.png" alt="EMIPro Logo" className="h-8 w-auto rounded-md shadow-sm" />
            <span className="text-lg font-black tracking-tight text-gray-900 dark:text-white">
              EMI<span className="text-indigo-600">Pro</span>
            </span>
          </div> */}
          <Logo />
          <p className="text-sm text-gray-500">
            &copy; {new Date().getFullYear()} EMIPro Finance Tracking. All rights reserved.
          </p>
          <div className="flex gap-6 text-sm font-bold text-gray-600 dark:text-gray-400">
            <Link href={route('privacy')} className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Privacy</Link>
            <Link href={route('terms')} className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Terms</Link>
            <Link href={route('support')} className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Support</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
