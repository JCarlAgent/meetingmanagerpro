import React from 'react';
import { EditableContent } from './EditableContent';
import { useContent } from '../context/ContentContext';

export const Hero: React.FC = () => {
  const { content } = useContent();

  const scrollToFeatures = () => {
    document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="relative">
      {/* Logo Overlapping Hero - Left Aligned */}
      <div className="relative z-20 flex justify-start pl-4 md:pl-8">
        <img 
          src="https://d64gsuwffb70l.cloudfront.net/6870115d9722f8859b7ed68f_1761371051469_dd208754.png" 
          alt="Meeting Manager Pro" 
          className="w-20 md:w-32 relative top-0"
          style={{ marginBottom: '-40px' }}
        />
      </div>


      {/* Hero Section */}
      <div className="relative bg-gradient-to-r from-gray-900 to-gray-800 text-white overflow-hidden pt-32">
        <div className="absolute inset-0 opacity-20">
          <img 
            src="https://d64gsuwffb70l.cloudfront.net/68fc69ac6e6835e7f96893e9_1761374088041_119c2fb3.webp"
            alt="Hero Background" 
            className="w-full h-full object-cover"
          />
        </div>
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-32">
          <div className="text-center">
            <EditableContent 
              path="home.hero.title" 
              value={content.home.hero.title} 
              as="h1" 
              className="text-4xl md:text-6xl font-bold mb-6"
            />
            <EditableContent 
              path="home.hero.subtitle" 
              value={content.home.hero.subtitle} 
              as="p" 
              className="text-xl md:text-2xl mb-8 text-gray-300 max-w-3xl mx-auto"
            />
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button 
                onClick={scrollToFeatures}
                className="bg-red-600 text-white px-8 py-4 rounded-md text-lg font-semibold hover:bg-red-700 transition-colors shadow-lg"
              >
                {content.home.hero.ctaText}
              </button>
              <button 
                onClick={() => window.location.href = '/contact'}
                className="bg-white text-gray-900 px-8 py-4 rounded-md text-lg font-semibold hover:bg-gray-100 transition-colors shadow-lg"
              >
                Contact Us
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
