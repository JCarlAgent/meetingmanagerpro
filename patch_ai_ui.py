import re

with open('backend/src/components/dashboard/AiCampaignQuery.tsx', 'r') as f:
    code = f.read()

# 1. Add state for campaign type
code = code.replace("const [query, setQuery] = useState('');", "const [query, setQuery] = useState('');\n  const [campaignType, setCampaignType] = useState<'financial'|'medicare'>('financial');")

# 2. Add campaignType to the payload
code = code.replace("listContext: listSummary // Injects the real data stats!\n      };", "listContext: listSummary, // Injects the real data stats!\n        campaignType\n      };")


# 3. Add the UI toggle buttons above the textarea
ui_addition = """
              {/* Campaign Type Toggle */}
              <div className="flex gap-2 px-4 pt-4">
                <button
                  type="button"
                  onClick={() => setCampaignType('financial')}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${campaignType === 'financial' ? 'bg-indigo-100 text-ind                  className={gr        ove                  className={`px-4 py-1.5 rounded-full text-sm font-medium                   tton>                  className={`p                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${campaignType === 'financial' ? 'bg-indigo-100 text-ind                  className={gr        ove   === 'medicare' ? 'bg-indigo-100 text-ind                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${campaignType === 'financial' ? 'bg-indigo-100 text-ind                  <textarea
"""
codecodecodecodecodecodecodecodecodecodecodecodecodeopcodecodecodecod/cocodecodecodecodecodecodecodecodecodecode 'wcodecodecodecodecodecodecodecodecodecodecodecodecod

