import React from 'react';
import { Navigation } from '../components/Navigation';
import { Footer } from '../components/Footer';
import { AdminPanel } from '../components/AdminPanel';
import { EditableContent } from '../components/EditableContent';
import { useContent } from '../context/ContentContext';

export const MissionPage: React.FC = () => {
  const { content } = useContent();

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <AdminPanel />
      <main className="flex-grow">

        <div className="bg-gradient-to-r from-red-600 to-red-700 text-white py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <EditableContent 
              path="mission.title" 
              value={content.mission.title} 
              as="h1" 
              className="text-4xl md:text-5xl font-bold mb-4"
            />
            <EditableContent 
              path="mission.subtitle" 
              value={content.mission.subtitle || ''} 
              as="p" 
              className="text-xl"
            />
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <img 
            src={content.mission.image} 
            alt="Our Mission" 
            className="rounded-lg shadow-xl w-full h-96 object-cover mb-12"
          />
          
          <div className="prose prose-lg max-w-none">
            <EditableContent 
              path="mission.body" 
              value={content.mission.body} 
              as="p" 
              className="text-gray-700 text-lg leading-relaxed mb-8"
              multiline
            />

            <div className="grid md:grid-cols-3 gap-8 mt-12">
              <div className="bg-red-50 p-6 rounded-lg">
                <div className="text-red-600 text-3xl font-bold mb-2">01</div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Data Intelligence</h3>
                <p className="text-gray-600">Harness the power of AI and big data to identify your ideal clients</p>
              </div>
              <div className="bg-red-50 p-6 rounded-lg">
                <div className="text-red-600 text-3xl font-bold mb-2">02</div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Strategic Tools</h3>
                <p className="text-gray-600">Access cutting-edge tools designed to maximize your efficiency</p>
              </div>
              <div className="bg-red-50 p-6 rounded-lg">
                <div className="text-red-600 text-3xl font-bold mb-2">03</div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Maximize ROI</h3>
                <p className="text-gray-600">Convert more prospects into clients and grow your business</p>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};
