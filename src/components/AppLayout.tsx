import React from 'react';
import { Navigation } from './Navigation';
import { Footer } from './Footer';
import { Hero } from './Hero';
import { Features } from './Features';
import { Testimonials } from './Testimonials';
import { AdminPanel } from './AdminPanel';

export const AppLayout: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <AdminPanel />
      <main className="flex-grow">
        <Hero />
        <Features />
        
        <div className="bg-white py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-gray-900 mb-4">How It Works</h2>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                Our proven three-step process to connect you with your ideal clients
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="bg-red-600 text-white w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">1</div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Identify</h3>
                <p className="text-gray-600">Use our AI-powered tools to identify and analyze your target market</p>
              </div>
              <div className="text-center">
                <div className="bg-red-600 text-white w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">2</div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Connect</h3>
                <p className="text-gray-600">Reach out to qualified prospects at the optimal time</p>
              </div>
              <div className="text-center">
                <div className="bg-red-600 text-white w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">3</div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Convert</h3>
                <p className="text-gray-600">Turn prospects into clients with data-driven insights</p>
              </div>
            </div>
          </div>
        </div>

        <Testimonials />

        <div className="bg-gradient-to-r from-red-600 to-red-700 text-white py-16">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to Transform Your Client Acquisition?</h2>
            <p className="text-xl mb-8">Join thousands of professionals who are maximizing their efficiency with Meeting Manager Pro</p>
            <button onClick={() => window.location.href = '/contact'} className="bg-white text-red-600 px-8 py-4 rounded-md text-lg font-semibold hover:bg-gray-100 transition-colors shadow-lg">Get Started Now</button>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};
