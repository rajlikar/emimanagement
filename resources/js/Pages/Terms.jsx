import { Head, Link, usePage } from '@inertiajs/react';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faWallet, faArrowLeft, faFileContract, faCheckCircle, faExclamationTriangle } from "@fortawesome/free-solid-svg-icons";
import Logo from '@/Components/Logo';

export default function Terms({ auth }) {
  const { contactEmail } = usePage().props;
  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0F172A] selection:bg-indigo-500 selection:text-white">
      <Head title="Terms of Service - EMIPro" />

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
              <FontAwesomeIcon icon={faFileContract} className="text-3xl text-white" />
            </div>
            <h1 className="text-5xl lg:text-6xl font-black text-gray-900 dark:text-white mb-4 tracking-tight">
              Terms of <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">Service</span>
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>

          {/* Content Sections */}
          <div className="space-y-8">
            <section className="p-8 rounded-3xl bg-white dark:bg-gray-800 border border-indigo-100 dark:border-indigo-800 shadow-sm">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">About this service</h2>
              <div className="text-gray-600 dark:text-gray-400 space-y-4">
                <p>
                  EMIPro is a private, personal record-keeping tool. Accounts are limited to approved users.
                </p>
                <p className="font-semibold text-gray-900 dark:text-white">
                  It is for information only. It is not a bank or a lender, it does not give financial, investment, credit or debt advice, and it does not make payments to your lender.
                </p>
                <p>
                  Schedules, interest and balances shown are estimates based on the figures you enter and a simplified calculation. Lenders may use different day-count, rounding and charge rules, so the numbers here can differ from yours. Always check amounts, due dates and closure or foreclosure figures against your lender's official statement.
                </p>
              </div>
            </section>

            <section className="p-8 rounded-3xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                  <FontAwesomeIcon icon={faCheckCircle} className="text-blue-600 dark:text-blue-400" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Acceptance of Terms</h2>
              </div>
              <div className="text-gray-600 dark:text-gray-400 space-y-4">
                <p>
                  By accessing and using EMIPro's services, you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.
                </p>
                <p>
                  These Terms of Service ("Terms") govern your use of our EMI management platform and all related services, features, content, and applications offered by EMIPro ("we," "us," or "our").
                </p>
              </div>
            </section>

            <section className="p-8 rounded-3xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-purple-50 dark:bg-purple-900/30 rounded-xl flex items-center justify-center">
                  <FontAwesomeIcon icon={faFileContract} className="text-purple-600 dark:text-purple-400" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Use of Service</h2>
              </div>
              <div className="text-gray-600 dark:text-gray-400 space-y-4">
                <p>
                  EMIPro provides a platform for managing and tracking your loan EMI payments. You agree to:
                </p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>Provide accurate, current, and complete information during registration</li>
                  <li>Maintain the security of your password and account</li>
                  <li>Notify us immediately of any unauthorized use of your account</li>
                  <li>Use the service only for lawful purposes and in accordance with these Terms</li>
                  <li>Not attempt to gain unauthorized access to any portion of the service</li>
                  <li>Not use the service to transmit any malicious code or harmful content</li>
                </ul>
              </div>
            </section>

            <section className="p-8 rounded-3xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-green-50 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
                  <FontAwesomeIcon icon={faCheckCircle} className="text-green-600 dark:text-green-400" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">User Accounts</h2>
              </div>
              <div className="text-gray-600 dark:text-gray-400 space-y-4">
                <p>
                  When you create an account with us, you must provide information that is accurate, complete, and current at all times. Failure to do so constitutes a breach of the Terms.
                </p>
                <p>
                  You are responsible for:
                </p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>Safeguarding the password you use to access the service</li>
                  <li>All activities that occur under your account</li>
                  <li>Immediately notifying us of any security breach</li>
                </ul>
                <p className="font-semibold text-gray-900 dark:text-white">
                  We reserve the right to suspend or terminate your account if any information provided proves to be inaccurate, false, or misleading.
                </p>
              </div>
            </section>

            <section className="p-8 rounded-3xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-orange-50 dark:bg-orange-900/30 rounded-xl flex items-center justify-center">
                  <FontAwesomeIcon icon={faExclamationTriangle} className="text-orange-600 dark:text-orange-400" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Limitation of Liability</h2>
              </div>
              <div className="text-gray-600 dark:text-gray-400 space-y-4">
                <p>
                  EMIPro is a tool to help you manage your loan payments. We are not:
                </p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>A bank or lending institution</li>
                  <li>A provider of financial, investment, credit or debt advice</li>
                  <li>An official source of loan balances or closure amounts</li>
                  <li>Responsible for making actual payments on your behalf</li>
                  <li>Liable for any missed payments or late fees incurred</li>
                  <li>Responsible for the accuracy of third-party data</li>
                </ul>
                <p className="font-semibold text-gray-900 dark:text-white">
                  In no event shall EMIPro be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of or inability to use the service.
                </p>
              </div>
            </section>

            <section className="p-8 rounded-3xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Intellectual Property</h2>
              <div className="text-gray-600 dark:text-gray-400 space-y-4">
                <p>
                  The service and its original content, features, and functionality are and will remain the exclusive property of EMIPro and its licensors. The service is protected by copyright, trademark, and other laws.
                </p>
                <p>
                  Our trademarks and trade dress may not be used in connection with any product or service without our prior written consent.
                </p>
              </div>
            </section>

            <section className="p-8 rounded-3xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Termination</h2>
              <div className="text-gray-600 dark:text-gray-400 space-y-4">
                <p>
                  We may terminate or suspend your account immediately, without prior notice or liability, for any reason, including without limitation if you breach the Terms.
                </p>
                <p>
                  Upon termination, your right to use the service will immediately cease. If you wish to terminate your account, you may simply discontinue using the service or contact our support team.
                </p>
              </div>
            </section>

            <section className="p-8 rounded-3xl bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border border-indigo-100 dark:border-indigo-800">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Contact Us</h2>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                If you have any questions about these Terms of Service, please contact us at:
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
