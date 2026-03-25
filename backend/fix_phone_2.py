import re

filepath = "src/components/dashboard/AiCampaignQuery.tsx"
with open(filepath, "r") as f:
    content = f.read()

# We only want to replace the first occurrence or specific occurrence of phone wrapping.
# It looks like:
#              {result.recommendedVenue.phone && (
#                <div className="flex items-center text-sm font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded w-fit">
#                  <Phone className="w-3.5 h-3.5 mr-1.5" />
#                  <a href={`tel:${result.recommendedVenue.phone}`} className="hover:underline">{result.recommendedVenue.phone}</a>
#                </div>
#              )}

import re
pattern = r'\{result\.recommendedVenue\.phone && \(\s*<div className="flex items-center text-sm font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded w-fit">\s*<Phone className="w-3\.5 h-3\.5 mr-1\.5" />\s*<a href=\{`tel:\$\{result\.recommendedVenue\.phone\}`\} className="hover:underline">\{result\.recommendedVenue\.phone\}</a>\s*</dipattern = r'\{result\.t = """{rpattt.recompattern = r'\{result\.recommendedVenue\.phone && \(\s*<flex flex-col gap-1 mt-2">
                           ecom              one.split('|').map((p, idx) => {
                    const cleanP = p.trim();
                                                               x} className="flex items-center text-sm font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded w-fit">
                        <Phone className="w-3.5 h-3.5 mr-1.5" />
                        <a href={`tel:${cleanP}`} className="hover:underline">{cleanP}</a>
                      </div>
                    );
                  })}
                </div>
              )}"""

new_content, count = re.subn(pattern, replacement, content)

with open(filepath, "w") as f:
    f.write(new_content)

print(f"Replaced {count} occurrences")
