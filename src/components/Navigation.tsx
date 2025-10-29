import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';


export const Navigation: React.FC = () => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const isHomePage = location.pathname === '/';

  return (
    <nav className="bg-white shadow-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          {/* Logo - Only show on non-home pages */}
          {!isHomePage && (
            <Link to="/" className="flex-shrink-0">
              <img 
                src="https://d64gsuwffb70l.cloudfront.net/6870115d9722f8859b7ed68f_1761371051469_dd208754.png" 
                alt="Meeting Manager Pro" 
                className="h-12 w-auto"
              />
            </Link>
          )}


          {/* Desktop Menu */}
          <div className={`hidden md:flex items-center space-x-8 ${isHomePage ? 'mx-auto' : ''}`}>

            <Link to="/" className="text-gray-700 hover:text-red-600 transition-colors font-medium">Home</Link>
            
            <div className="relative">
              <button 
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="text-gray-700 hover:text-red-600 transition-colors font-medium flex items-center"
              >
                Meeting Specialties
                <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {isDropdownOpen && (
                <div className="absolute left-0 mt-2 w-56 bg-white rounded-md shadow-lg py-2 z-50">
                  <Link to="/financial-planners" className="block px-4 py-2 text-gray-700 hover:bg-red-50 hover:text-red-600" onClick={() => setIsDropdownOpen(false)}>Financial Planners</Link>
                  <Link to="/medicare" className="block px-4 py-2 text-gray-700 hover:bg-red-50 hover:text-red-600" onClick={() => setIsDropdownOpen(false)}>Medicare</Link>
                  <Link to="/stem-cell" className="block px-4 py-2 text-gray-700 hover:bg-red-50 hover:text-red-600" onClick={() => setIsDropdownOpen(false)}>Stem Cell</Link>
                  <Link to="/reverse-mortgage" className="block px-4 py-2 text-gray-700 hover:bg-red-50 hover:text-red-600" onClick={() => setIsDropdownOpen(false)}>Reverse Mortgage</Link>
                </div>
              )}
            </div>


            <Link to="/mission" className="text-gray-700 hover:text-red-600 transition-colors font-medium">Our Mission</Link>
            <Link to="/contact" className="text-gray-700 hover:text-red-600 transition-colors font-medium">Contact</Link>
          </div>

          {/* Mobile Menu Button */}
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="md:hidden">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden pb-4">
            <Link to="/" className="block py-2 text-gray-700 hover:text-red-600">Home</Link>
            <div className="pl-4">
              <p className="py-2 text-gray-500 text-sm font-semibold">Meeting Specialties</p>
              <Link to="/financial-planners" className="block py-2 text-gray-700 hover:text-red-600">Financial Planners</Link>
              <Link to="/medicare" className="block py-2 text-gray-700 hover:text-red-600">Medicare</Link>
              <Link to="/stem-cell" className="block py-2 text-gray-700 hover:text-red-600">Stem Cell</Link>
              <Link to="/reverse-mortgage" className="block py-2 text-gray-700 hover:text-red-600">Reverse Mortgage</Link>
            </div>
            <Link to="/mission" className="block py-2 text-gray-700 hover:text-red-600">Our Mission</Link>
            <Link to="/contact" className="block py-2 text-gray-700 hover:text-red-600">Contact</Link>
          </div>
        )}
      </div>

    </nav>
  );
};
