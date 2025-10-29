import React, { useState } from 'react';
import { useContent } from '../context/ContentContext';

interface EditableContentProps {
  path: string;
  value: string;
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span';
  className?: string;
  multiline?: boolean;
}

export const EditableContent: React.FC<EditableContentProps> = ({
  path,
  value,
  as: Component = 'p',
  className = '',
  multiline = false
}) => {
  const { isAdminMode, updateContent } = useContent();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);

  const handleSave = () => {
    updateContent(path, editValue);
    setIsEditing(false);
  };

  if (isAdminMode && isEditing) {
    return (
      <div className="relative">
        {multiline ? (
          <textarea
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="w-full p-2 border-2 border-red-600 rounded"
            rows={4}
          />
        ) : (
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="w-full p-2 border-2 border-red-600 rounded"
          />
        )}
        <div className="flex gap-2 mt-2">
          <button onClick={handleSave} className="px-3 py-1 bg-red-600 text-white rounded">Save</button>
          <button onClick={() => setIsEditing(false)} className="px-3 py-1 bg-gray-400 text-white rounded">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <Component
      className={`${className} ${isAdminMode ? 'cursor-pointer hover:bg-yellow-100 transition-colors' : ''}`}
      onClick={() => isAdminMode && setIsEditing(true)}
    >
      {value}
    </Component>
  );
};
