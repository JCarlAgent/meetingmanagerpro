import React from 'react';
import { Link } from 'react-router-dom';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <img 
              src="https://d64gsuwffb70l.cloudfront.net/68fc69ac6e6835e7f96893e9_1761376908797_8fe5af34.webp" 
              alt="Professional Networking" 
              className="h-32 w-32 rounded-lg object-cover mb-4"
            />
            <p className="text-gray-400 text-sm">
              Empowering professionals to find and connect with their ideal clients efficiently.
            </p>
          </div>


          <div>
            <h3 className="text-lg font-semibold mb-4">Quick Links</h3>
            <ul className="space-y-2">
              <li><Link to="/" className="text-gray-400 hover:text-red-500 transition-colors">Home</Link></li>
              <li><Link to="/mission" className="text-gray-400 hover:text-red-500 transition-colors">Our Mission</Link></li>
              <li><Link to="/contact" className="text-gray-400 hover:text-red-500 transition-colors">Contact</Link></li>
              <li><Link to="/admin-login" className="text-gray-400 hover:text-red-500 transition-colors">Admin</Link></li>

            </ul>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4">Specialties</h3>
            <ul className="space-y-2">
              <li><Link to="/financial-planners" className="text-gray-400 hover:text-red-500 transition-colors">Financial Planners</Link></li>
              <li><Link to="/medicare" className="text-gray-400 hover:text-red-500 transition-colors">Medicare</Link></li>
              <li><Link to="/stem-cell" className="text-gray-400 hover:text-red-500 transition-colors">Stem Cell</Link></li>
              <li><Link to="/reverse-mortgage" className="text-gray-400 hover:text-red-500 transition-colors">Reverse Mortgage</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4">Contact</h3>
            <p className="text-gray-400 text-sm mb-2">Email:</p>
            <a href="mailto:support@meetingmarketerpro.com" className="text-red-500 hover:text-red-400 transition-colors block">
              <span className="block">support</span>
              <span className="block">@meetingmarketerpro.com</span>
            </a>
          </div>
        </div>


        <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400 text-sm">
          <p>&copy; {new Date().getFullYear()} Meeting Manager Pro. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};
