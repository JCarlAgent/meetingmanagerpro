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
                A simple workflow your entire FMO can follow
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="bg-red-600 text-white w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">1</div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Set Up</h3>
                <p className="text-gray-600">Create the campaign, assign advisors, and add event details.</p>
              </div>
              <div className="text-center">
                <div className="bg-red-600 text-white w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">2</div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Launch</h3>
                <p className="text-gray-600">Upload lists, choose templates, send to print/mail, and track delivery.</p>
              </div>
              <div className="text-center">
                <div className="bg-red-600 text-white w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">3</div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Report</h3>
                <p className="text-gray-600">See RSVPs, appointments, and roll-up performance across your organization.</p>
              </div>
            </div>
          </div>
        </div>

        <Testimonials />

        <div className="bg-gradient-to-r from-red-600 to-red-700 text-white py-16">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to Standardize Seminar Marketing Across Your FMO?</h2>
            <p className="text-xl mb-8">We’ll help you roll out a repeatable process, advisor by advisor, with full visibility for leadership.</p>
            <button onClick={() => window.location.href = '/contact'} className="bg-white text-red-600 px-8 py-4 rounded-md text-lg font-semibold hover:bg-gray-100 transition-colors shadow-lg">Request a Demo</button>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};
