import re

filepath = "backend/src/components/dashboard/AiCampaignQuery.tsx"
with open(filepath, "r") as f:
    content = f.read()

# Replace the phone display logic.
# The original was:
old_phone = """              {result.recommendedVenue.phone && (
                <div className="flex items-center text-sm font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded w-fit">
                  <Phone className="w-3.5 h-3.5 mr-1.5" />
                  <a href={`tel:${result.recommendedVenue.phone}`} className="hover:underline">{result.recommendedVenue.phone}</a>
                </div>
              )}"""

new_phone = """              {result.recommendedVenue.phone && (
                <div className="flex flex-col gap-1 mt-2">
                  {result.recommendedVenue.phone.split('|').map((p, idx) => (
                    <div key={idx} className="flex items-center text-sm font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded w-fit">
                      <Phone className="w-3                      <Phon                                 trim()}`} className="hover:underline">{p.trim()}</a>
                    </div>
                  ))}
                </div>
              )}"""

content = content.replace(old_phone, new_phone)

with open(filepath, "w") as f:
    f.write(content)
