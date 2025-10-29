import React from 'react';

export const Testimonials: React.FC = () => {
  const testimonials = [
    {
      name: 'Sarah Johnson',
      role: 'Financial Planner',
      content: 'Meeting Manager Pro has transformed how I connect with high net worth clients. My conversion rate has increased by 40%!',
      rating: 5,
      image: 'https://d64gsuwffb70l.cloudfront.net/68fc69ac6e6835e7f96893e9_1761376196602_2ee1a35e.webp'
    },
    {
      name: 'Michael Chen',
      role: 'Medicare Specialist',
      content: 'The targeting tools are incredible. I can now reach people exactly when they need Medicare guidance. Game changer!',
      rating: 5,
      image: 'https://d64gsuwffb70l.cloudfront.net/68fc69ac6e6835e7f96893e9_1761376197392_5ad09e81.webp'
    },
    {
      name: 'Dr. Emily Rodriguez',
      role: 'Stem Cell Practitioner',
      content: 'Finding qualified prospects used to take weeks. Now it takes days. The ROI has been phenomenal.',
      rating: 5,
      image: 'https://d64gsuwffb70l.cloudfront.net/68fc69ac6e6835e7f96893e9_1761376198122_7e171a8b.webp'
    }
  ];

  return (
    <div className="bg-gray-50 py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">What Our Clients Say</h2>
          <p className="text-xl text-gray-600">Join thousands of satisfied professionals</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {testimonials.map((testimonial, index) => (
            <div key={index} className="bg-white p-8 rounded-lg shadow-md">
              <img 
                src={testimonial.image} 
                alt={testimonial.name}
                className="w-20 h-20 rounded-full object-cover mx-auto mb-4"
              />
              <div className="flex justify-center mb-4">
                {[...Array(testimonial.rating)].map((_, i) => (
                  <svg key={i} className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
              <p className="text-gray-600 mb-6 italic text-center">"{testimonial.content}"</p>
              <div className="text-center">
                <p className="font-semibold text-gray-900">{testimonial.name}</p>
                <p className="text-sm text-gray-500">{testimonial.role}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
