
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import { ContentProvider } from "./context/ContentContext";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { ContactPage } from "./pages/ContactPage";
import { MissionPage } from "./pages/MissionPage";
import { SpecialtyPage } from "./pages/SpecialtyPage";
import { AdminLoginPage } from "./pages/AdminLoginPage";
import { AdminPanelPage } from "./pages/AdminPanelPage";


const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider defaultTheme="light">
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ContentProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/mission" element={<MissionPage />} />
              <Route path="/financial-planners" element={<SpecialtyPage contentKey="financialPlanners" />} />
              <Route path="/medicare" element={<SpecialtyPage contentKey="medicare" />} />
              <Route path="/stem-cell" element={<SpecialtyPage contentKey="stemCell" />} />
              <Route path="/reverse-mortgage" element={<SpecialtyPage contentKey="reverseMortgage" />} />
              <Route path="/admin-login" element={<AdminLoginPage />} />
              <Route path="/admin-panel" element={<AdminPanelPage />} />
              <Route path="*" element={<NotFound />} />

            </Routes>
          </BrowserRouter>
        </ContentProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
