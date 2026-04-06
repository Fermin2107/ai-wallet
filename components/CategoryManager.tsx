'use client'

import { useState } from 'react'
import { Settings, Plus, Edit2, Trash2, Save, X, Tag } from 'lucide-react'

interface Category {
  name: string;
  keywords: string[];
  essential: boolean;
  editable: boolean;
  color: string;
}

interface CategoryManagerProps {
  categories: Category[];
  onUpdateCategory: (name: string, updates: Partial<Category>) => void;
  onAddCategory: (category: Omit<Category, 'name'>, name: string) => void;
  onDeleteCategory: (name: string) => void;
}

export default function CategoryManager({ 
  categories, 
  onUpdateCategory, 
  onAddCategory, 
  onDeleteCategory 
}: CategoryManagerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<string | null>(null)
  const [newCategory, setNewCategory] = useState({
    name: '',
    keywords: '',
    essential: false,
    color: '#6b7280'
  })
  const [editForm, setEditForm] = useState<{
    essential?: boolean;
    editable?: boolean;
    color?: string;
    keywords?: string;
  }>({})

  const handleAddCategory = () => {
    if (newCategory.name && newCategory.keywords) {
      onAddCategory({
        keywords: newCategory.keywords.split(',').map((k: string) => k.trim()),
        essential: newCategory.essential,
        editable: true,
        color: newCategory.color
      }, newCategory.name)
      
      setNewCategory({
        name: '',
        keywords: '',
        essential: false,
        color: '#6b7280'
      })
    }
  }

  const handleUpdateCategory = (name: string) => {
    if (editForm.keywords) {
      onUpdateCategory(name, {
        essential: editForm.essential,
        editable: editForm.editable,
        color: editForm.color,
        keywords: editForm.keywords.split(',').map((k: string) => k.trim())
      })
    }
    setEditingCategory(null)
    setEditForm({})
  }

  const startEdit = (category: Category) => {
    setEditingCategory(category.name)
    setEditForm({
      essential: category.essential,
      editable: category.editable,
      color: category.color,
      keywords: category.keywords.join(', ')
    })
  }

  const cancelEdit = () => {
    setEditingCategory(null)
    setEditForm({})
  }

  return (
    <div className="bg-white rounded-lg shadow-sm">
      <div className="border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Tag className="w-5 h-5" />
            Gestión de Categorías
          </h3>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="p-4 space-y-6">
          {/* Agregar nueva categoría */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Nueva Categoría
            </h4>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Nombre de la categoría"
                value={newCategory.name}
                onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <textarea
                placeholder="Palabras clave (separadas por comas)"
                value={newCategory.keywords}
                onChange={(e) => setNewCategory({ ...newCategory, keywords: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                rows={2}
              />
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={newCategory.essential}
                    onChange={(e) => setNewCategory({ ...newCategory, essential: e.target.checked })}
                    className="rounded border-gray-300 text-primary-500 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700">Esencial</span>
                </label>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-700">Color:</label>
                  <input
                    type="color"
                    value={newCategory.color}
                    onChange={(e) => setNewCategory({ ...newCategory, color: e.target.value })}
                    className="w-8 h-8 rounded border border-gray-300"
                  />
                </div>
              </div>
              <button
                onClick={handleAddCategory}
                className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Agregar Categoría
              </button>
            </div>
          </div>

          {/* Lista de categorías */}
          <div className="space-y-3">
            <h4 className="font-medium text-gray-900">Categorías Existentes</h4>
            {categories.map((category) => (
              <div key={category.name} className="border border-gray-200 rounded-lg p-4">
                {editingCategory === category.name ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h5 className="font-medium text-gray-900 capitalize">{category.name}</h5>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleUpdateCategory(category.name)}
                          className="p-1 text-success-600 hover:bg-success-50 rounded"
                        >
                          <Save className="w-4 h-4" />
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="p-1 text-danger-600 hover:bg-danger-50 rounded"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <textarea
                      placeholder="Palabras clave (separadas por comas)"
                      value={editForm.keywords || ''}
                      onChange={(e) => setEditForm({ ...editForm, keywords: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      rows={2}
                    />
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={editForm.essential || false}
                          onChange={(e) => setEditForm({ ...editForm, essential: e.target.checked })}
                          className="rounded border-gray-300 text-primary-500 focus:ring-primary-500"
                        />
                        <span className="text-sm text-gray-700">Esencial</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <label className="text-sm text-gray-700">Color:</label>
                        <input
                          type="color"
                          value={editForm.color || category.color}
                          onChange={(e) => setEditForm({ ...editForm, color: e.target.value })}
                          className="w-8 h-8 rounded border border-gray-300"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <div
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: category.color }}
                        />
                        <h5 className="font-medium text-gray-900 capitalize">{category.name}</h5>
                        {category.essential && (
                          <span className="px-2 py-1 bg-success-100 text-success-700 text-xs rounded-full">
                            Esencial
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {category.keywords.slice(0, 5).map((keyword, index) => (
                          <span
                            key={index}
                            className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded"
                          >
                            {keyword}
                          </span>
                        ))}
                        {category.keywords.length > 5 && (
                          <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                            +{category.keywords.length - 5}
                          </span>
                        )}
                      </div>
                    </div>
                    {category.editable && (
                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={() => startEdit(category)}
                          className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onDeleteCategory(category.name)}
                          className="p-1 text-danger-500 hover:text-danger-700 hover:bg-danger-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
