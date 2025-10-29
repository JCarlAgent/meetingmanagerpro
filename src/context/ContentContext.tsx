import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ContentData } from '../types/content';
import { supabase } from '@/lib/supabase';

const defaultContent: ContentData = {
  home: {
    hero: {
      title: 'Empower Your Client Acquisition',
      subtitle: 'Leverage AI and data intelligence to find and connect with your ideal clients efficiently',
      ctaText: 'Get Started Today'
    },
    features: [
      { title: 'Data-Driven Insights', description: 'Utilize advanced analytics to identify high-value prospects' },
      { title: 'Targeted Outreach', description: 'Connect with the right clients at the right time' },
      { title: 'Maximize ROI', description: 'Optimize your meeting strategy for maximum profitability' }
    ]
  },
  contact: {
    title: 'Contact Us',
    subtitle: 'We\'re here to help you succeed',
    body: 'Have questions? Our customer service team is ready to assist you.',
    email: 'support@meetingmarketerpro.com',
    image: 'https://d64gsuwffb70l.cloudfront.net/68fc69ac6e6835e7f96893e9_1761372645973_371dea05.webp'
  },
  mission: {
    title: 'Our Mission',
    subtitle: 'Empowering Professionals in the AI Era',
    body: 'In today\'s world of AI and massive information availability, our goal is to empower our users to be the most efficient in finding and building their client base. We help you obtain, analyze and utilize the best tools so as to maximize profitability.',
    image: 'https://d64gsuwffb70l.cloudfront.net/68fc69ac6e6835e7f96893e9_1761376909568_d5b4d190.webp'
  },
  financialPlanners: {
    title: 'Financial Planners',
    subtitle: 'Connect with High Net Worth Individuals',
    body: 'Utilizing the data to attract mid-high net worth individuals that are interested in your advice to keep on top of market and political changes. Our platform helps you identify prospects who are actively seeking financial guidance.',
    image: 'https://d64gsuwffb70l.cloudfront.net/68fc69ac6e6835e7f96893e9_1761373673776_fce89b8d.webp'
  },
  medicare: {
    title: 'Medicare Specialists',
    subtitle: 'Find Clients at the Right Time',
    body: 'Finding those at the right time to get them properly signed up for Medicare (turning 65 meetings) and to help others that may want to change their plan during open enrollment. Target prospects when they need you most.',
    image: 'https://d64gsuwffb70l.cloudfront.net/68fc69ac6e6835e7f96893e9_1761373675634_b2de2458.webp'
  },
  stemCell: {
    title: 'Stem Cell Practitioners',
    subtitle: 'Educate High-Value Prospects',
    body: 'Targeting certain age and income/net worth individuals to educate them on the benefits of a pain free life. Connect with prospects who are seeking innovative health solutions.',
    image: 'https://d64gsuwffb70l.cloudfront.net/68fc69ac6e6835e7f96893e9_1761373677625_6f8d7d9b.webp'
  },
  reverseMortgage: {
    title: 'Reverse Mortgage Lenders',
    subtitle: 'Help Seniors Live Stress-Free',
    body: 'Helping those 62+ who want to live stress free in their later years and have equity in their home they have earned and want to enjoy without worrying about payments. Find qualified homeowners ready to explore their options.',
    image: 'https://d64gsuwffb70l.cloudfront.net/68fc69ac6e6835e7f96893e9_1761373679424_fb50575a.webp'
  }
};

interface ContentContextType {
  content: ContentData;
  updateContent: (path: string, value: any) => void;
  isAdminMode: boolean;
  toggleAdminMode: () => void;
  loading: boolean;
}

const ContentContext = createContext<ContentContextType | undefined>(undefined);

export const ContentProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [content, setContent] = useState<ContentData>(defaultContent);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load content from Supabase on mount
  useEffect(() => {
    loadContent();
  }, []);

  const loadContent = async () => {
    try {
      const { data, error } = await supabase
        .from('content')
        .select('*');

      if (error) throw error;

      if (data && data.length > 0) {
        const loadedContent: any = { ...defaultContent };
        
        data.forEach((row: any) => {
          loadedContent[row.section] = row.data;
        });

        setContent(loadedContent);
      }
    } catch (error) {
      console.error('Error loading content:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateContent = async (path: string, value: any) => {
    // Update local state immediately
    setContent(prev => {
      const keys = path.split('.');
      const updated = { ...prev };
      let current: any = updated;
      
      for (let i = 0; i < keys.length - 1; i++) {
        current[keys[i]] = { ...current[keys[i]] };
        current = current[keys[i]];
      }
      
      current[keys[keys.length - 1]] = value;
      
      // Save to Supabase
      const section = keys[0];
      const sectionData = updated[section];
      
      supabase
        .from('content')
        .upsert({ 
          section, 
          data: sectionData,
          updated_at: new Date().toISOString()
        }, { 
          onConflict: 'section' 
        })
        .then(({ error }) => {
          if (error) console.error('Error saving content:', error);
        });
      
      return updated;
    });
  };

  const toggleAdminMode = () => setIsAdminMode(prev => !prev);

  return (
    <ContentContext.Provider value={{ content, updateContent, isAdminMode, toggleAdminMode, loading }}>
      {children}
    </ContentContext.Provider>
  );
};

export const useContent = () => {
  const context = useContext(ContentContext);
  if (!context) throw new Error('useContent must be used within ContentProvider');
  return context;
};
