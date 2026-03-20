import re

with open('src/components/dashboard/AiCampaignQuery.tsx', 'r') as f:
    text = f.read()

# 1. Update the form to have optimize button at the bottom
form_regex = r'<form onSubmit=\{handleSearch\}.*?</form>'
new_form = """<form onSubmit={handleSearch} className={`relative flex flex-col bg-white shadow-xl rounded-2xl overflow-hidden border ${isTollLocked ? 'border-red-200' : 'border-gray-100'}`}>
          <div className={`flex relative items-start`}>
            <div className={`pl-4 pt-4 sm:pl-6 sm:pt-6 ${isTollLocked ? 'text-red-400' : 'text-indigo-500'}`}>
              {isTollLocked ? <AlertCircle className="w-6 h-6 sm:w-8 sm:h-8" /> : <Sparkles className="w-6 h-6 sm:w-8 sm:h-8" />}
            </div>
            
            <textarea
              className={`w-full px-4 py-4 sm:py-6 text-lg sm:text-xl bg-transparent border-none focus:outline-none focus:ring-0 resize-none min-h-[120p              className={`w-full px-4 py-4 sm:py-6 text-lg sm:text-xl bg-transparent bord0 placeholder-gray-400'}`}
              placeholder={isTollLocked ? "ROI Reporting Required to Unlock" : "E.g., I want 50 qualified annuity leads in Dallas next month...\\n\\n(Press Enter to analyze, Shift+Enter for new line)"}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={isProcessing || isTollLocked}
              onKeyDown={(e) => {
                if (e.key ===                 if (e.key ===                 if (e.keef                if (e.key ===                 if (e.key ===                 if (e.keef                if (e.krch(e as unknown as React.FormEvent);
                  }
                }
              }}
            />
          </div>

          <div className=      items-center justify-between           <div className=      items-center justify-between           <div className=      items-center justify-between           <div className=      items-center justify-between           <div className=      items-center justify-between           <div className       accept=".csv" 
                  className="hidden" 
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={`p-2 sm:p-3 rounded-xl transition-colors flex items-center ${uploade                  className={`p-2 sm:p-3 rounded-xl transition-colors flex items-center ${uploade                  className={`p-2 sm:p-3 rounded-xl transition-colors flex items-center ${uploade                  className={`p-2                                       eadsh               w-             sm                                    className={`p-2 sm:p-3 rounded-xl transition-colors flex items-center ${uploade                  className={`p-2 sm:p-3 rounded-xl transition-colors flex items-center ${uploade                  className={`p-2 sm:p-3 rounded-xl transition-colors flex items-center ${uploade                  className={`p-2         <button
                                          disabled={isProcessing || !query.trim() || isTollLocked}
              className={`flex items-center justify-center px-6 py-2 sm:px-8 sm:py-3 rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                isTollLocked 
                  ? 'bg-red-100 text-red-500' 
                  : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md hover:shadow-lg'
              }`}
            >
              {isProcessing ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <span className="mr-2">{isTollLocked ? 'Locked' : 'Optimize'}</span>
                  {!isTollLocked && <ArrowRight className="w-5 h-5" />}
                </>
              )}
            </button>
          </div>
        </form>"""

text = re.sub(form_regex, new_form, text, flags=re.DOTALL)

# 2. Update grid to be 2 cols on mobile, 4 on desktop
grid_regex = r'<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">'
new_grid = '<div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-8">'
text = text.replace(grid_regex, new_grid)

# Map should intuitively be full width since it naturally occupies the below container, 
# The wrapper layout inside dashboard should make it full width. In AiCampaignQuery:
# `<div className="w-full max-w-4xl mx-auto space-y-8">` prevents full screen width.
# If we change# If we change# fu# If we chands.
wrapper_regex = r'<div className="w-full max-w-4xl mx-auto space-y-8">'
new_wrapper = '<divnew_wrapper = '<di mnew_wrappere-y-8">'
text = text.replace(wrapper_regex, new_wrapper)

with open('src/components/dashboard/Awith open('src/components/dashboard/f.write(text)

