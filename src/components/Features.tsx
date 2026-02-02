import React from 'react';
import { useContent } from '../context/ContentContext';

export const Features: React.FC = () => {
  const { content } = useContent();

  const phases = [
    {
      title: 'Plan',
      description: 'Create a campaign, schedule events, and assign planners.',
    },
    {
      title: 'Launch',
      description: 'Upload your mailing list, choose templates, and send to print/mail.',
    },
    {
      title: 'Track + Report',
      description: 'Monitor delivery, RSVPs, appointments, and advisor performance.',
    },
  ];

  return (
    <div id="features" className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">Built for FMOs</h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Standardize seminar marketing across dozens of planners—without losing visibility.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mb-16">
          {phases.map((phase) => (
            <div key={phase.title} className="bg-white p-8 rounded-lg shadow-md">
              <div className="bg-red-100 w-16 h-16 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">{phase.title}</h3>
              <p className="text-gray-600">{phase.description}</p>
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {content.home.features.map((feature, index) => (
            <div key={index} className="bg-white p-8 rounded-lg shadow-md">
              <div className="bg-red-100 w-16 h-16 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">{feature.title}</h3>
              <p className="text-gray-600">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
