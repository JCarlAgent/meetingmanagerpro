import re

with open('backend/src/components/dashboard/ClientDashboard.tsx', 'r') as f:
    content = f.read()

# 1. Add useState initialization
init_state_code = """
  const [activeCampaigns, setActiveCampaigns] = useState(mockActiveCampaigns);

  const toggleCampaignStatus = (campId: number, statusIndex: number) => {
    setActiveCampaigns(prev => prev.map(camp => {
      if (camp.id === campId) {
        const newStatus = [...camp.status];
        newStatus[statusIndex] = !newStatus[statusIndex];
        return { ...camp, status: newStatus };
      }
      return camp;
    }));
  };
"""
# Insert after `const [searchQuery, setSearchQuery] = useState('');`
content = content.replace("const [searchQuery, setSearchQuery] = useState('');", "const [searchQuery, setSearchQuery] = useState('');\n" + init_state_code)

# 2. Replace mockActiveCampaigns.map with activeCampaigns.map
content = content.replace("mockActiveCampaigns.map(camp => (", "activeCampaigns.map(camp => (")

# 3. # 3. # 3. # 3. # 3. # 3. # 3. #tus bl# 3. # 3ake them clickable buttons
status_block_old = r'<div className="flex flex-wrap lg:flex-nowrap items-center w-full justify-between gap-y-6 gap-x-2 text-sm">(.*?status_block_old = r'<div className="flex flex-wrap lg:flex-nowrasName="flex flestatus_block_old = r'<div className="flex flex-wrap lg:flex-nowrap items2 text-sm">
                        {[
                          'Demo Data Done',
                          'List Purchased',
                          'Design Chosen',
                                                                      'Mail Sent'
                        ].map((label, idx) => (
                          <button 
                                                                                                                                                                      -ce                                                          )] l                                                        ion-colors"
                          >
                            {camp.status[idx] 
                              ?                              ?                              ?                              ?                              ?                              ?                              ?                              ?                              ?                              ?               co                        ass                              ?         s-center w-full justify-between gap-y-6 gap-x-2                               ?          v>', status_block_new, content, flags=re.DOTALL)

with open('backend/src/components/dashboard/ClientDashboard.tsx', 'w') as f:
    f.write(content)

print("Patched.")
