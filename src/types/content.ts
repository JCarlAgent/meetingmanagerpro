export interface PageContent {
  title: string;
  subtitle?: string;
  body: string;
  image?: string;
}

export interface ContentData {
  home: {
    hero: {
      title: string;
      subtitle: string;
      ctaText: string;
    };
    features: Array<{
      title: string;
      description: string;
    }>;
  };
  contact: PageContent & { email: string; phone?: string };
  mission: PageContent;
  financialPlanners: PageContent;
  medicare: PageContent;
  stemCell: PageContent;
  reverseMortgage: PageContent;
}
