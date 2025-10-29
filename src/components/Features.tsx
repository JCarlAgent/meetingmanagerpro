import React from 'react';
import { Link } from 'react-router-dom';
import { useContent } from '../context/ContentContext';

export const Features: React.FC = () => {
  const { content } = useContent();

  const specialties = [
    {
      title: 'Financial Planners',
      description: 'Connect with high net worth individuals seeking financial guidance',
      icon: '💼',
      link: '/financial-planners',
      image: 'https://d64gsuwffb70l.cloudfront.net/68fc69ac6e6835e7f96893e9_1761372647828_beec57c1.webp'
    },
    {
      title: 'Medicare Specialists',
      description: 'Find clients turning 65 or in open enrollment periods',
      icon: '🏥',
      link: '/medicare',
      image: 'https://d64gsuwffb70l.cloudfront.net/68fc69ac6e6835e7f96893e9_1761372648695_66e83d56.webp'
    },
    {
      title: 'Stem Cell Practitioners',
      description: 'Target prospects interested in innovative health solutions',
      icon: '🧬',
      link: '/stem-cell',
      image: 'https://d64gsuwffb70l.cloudfront.net/68fc69ac6e6835e7f96893e9_1761372649574_f88ee0f3.webp'
    },
    {
      title: 'Reverse Mortgage',
      description: 'Help seniors 62+ unlock their home equity stress-free',
      icon: '🏠',
      link: '/reverse-mortgage',
      image: 'https://d64gsuwffb70l.cloudfront.net/68fc69ac6e6835e7f96893e9_1761372650418_e1fa61cb.webp'
    }
  ];

  return (
    <div id="features" className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">Meeting Specialties</h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Tailored solutions for professionals across multiple industries
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 mb-16">
          {specialties.map((specialty, index) => (
            <Link 
              key={index} 
              to={specialty.link}
              className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-xl transition-shadow group"
            >
              <div className="h-48 overflow-hidden">
                <img 
                  src={specialty.image} 
                  alt={specialty.title} 
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                />
              </div>
              <div className="p-6">
                <div className="text-4xl mb-3">{specialty.icon}</div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2 group-hover:text-red-600 transition-colors">
                  {specialty.title}
                </h3>
                <p className="text-gray-600">{specialty.description}</p>
              </div>
            </Link>
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
