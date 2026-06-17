import React, { useEffect, useState } from 'react';
import { Pill, Plus, X, Edit2, Trash2 } from 'lucide-react';

type Medication = {
  id: string;
  name: string;
  timeOfDay: 'morning' | 'afternoon' | 'night';
  instructions: string;
};

const MEDICATIONS_KEY = 'vital_diary_medications';

const loadMedications = () => {
  try {
    const stored = localStorage.getItem(MEDICATIONS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

export const Medications: React.FC = () => {
  const [medications, setMedications] = useState<Medication[]>(loadMedications);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    timeOfDay: 'morning' | 'afternoon' | 'night';
    instructions: string;
  }>({
    name: '',
    timeOfDay: 'morning',
    instructions: '',
  });

  useEffect(() => {
    localStorage.setItem(MEDICATIONS_KEY, JSON.stringify(medications));
  }, [medications]);

  const resetForm = () => {
    setFormData({ name: '', timeOfDay: 'morning', instructions: '' });
    setEditingId(null);
  };

  const openAddModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (medication: Medication) => {
    setFormData({
      name: medication.name,
      timeOfDay: medication.timeOfDay,
      instructions: medication.instructions,
    });
    setEditingId(medication.id);
    setShowModal(true);
  };

  const handleSave = () => {
    if (!formData.name.trim()) {
      return;
    }

    if (editingId) {
      setMedications(prev =>
        prev.map(med =>
          med.id === editingId
            ? { ...med, name: formData.name.trim(), timeOfDay: formData.timeOfDay, instructions: formData.instructions.trim() }
            : med
        )
      );
    } else {
      const newMedication: Medication = {
        id: `med-${Date.now()}`,
        name: formData.name.trim(),
        timeOfDay: formData.timeOfDay,
        instructions: formData.instructions.trim(),
      };
      setMedications(prev => [...prev, newMedication]);
    }

    resetForm();
    setShowModal(false);
  };

  const handleDelete = (id: string) => {
    setMedications(prev => prev.filter(med => med.id !== id));
  };

  return (
    <section id="medications-view" className="view-section active">
      <div className="panel panel-glass mb-4">
        <div className="panel-header border-bottom">
          <div className="panel-title-group">
            <Pill className="color-primary" size={22} />
            <h3>Medications</h3>
          </div>
          <button className="btn btn-success btn-sm" onClick={openAddModal}>
            <Plus size={14} style={{ marginRight: '4px' }} /> Add Medication
          </button>
        </div>

        <div className="summary-list">
          {medications.length === 0 ? (
            <div className="text-muted py-4 text-center">No medications added yet.</div>
          ) : (
            medications.map(medication => (
              <div key={medication.id} className="summary-item">
                <div>
                  <div className="summary-value">{medication.name}</div>
                  <div className="summary-label">{medication.timeOfDay.charAt(0).toUpperCase() + medication.timeOfDay.slice(1)}</div>
                  {medication.instructions && <div className="text-secondary text-sm">{medication.instructions}</div>}
                </div>
                <div className="d-flex gap-2">
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => openEditModal(medication)}
                    title="Edit"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    className="btn btn-outline btn-sm color-danger"
                    onClick={() => handleDelete(medication.id)}
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className={`modal-overlay ${showModal ? 'active' : ''}`} onClick={() => setShowModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingId ? 'Edit Medication' : 'Add New Medication'}</h2>
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label>Medication Name *</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g., Aspirin"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Time of Day *</label>
                <div className="radio-group">
                  {(['morning', 'afternoon', 'night'] as const).map(time => (
                    <label key={time} className="radio-label">
                      <input
                        type="radio"
                        name="timeOfDay"
                        value={time}
                        checked={formData.timeOfDay === time}
                        onChange={e => setFormData({ ...formData, timeOfDay: e.target.value as 'morning' | 'afternoon' | 'night' })}
                        className="radio-input"
                      />
                      <span className="radio-text">{time.charAt(0).toUpperCase() + time.slice(1)}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>Instructions</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g., Taken while fasting, With food, etc."
                  value={formData.instructions}
                  onChange={e => setFormData({ ...formData, instructions: e.target.value })}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>
                Cancel
              </button>
              <button
                className="btn btn-success"
                onClick={handleSave}
                disabled={!formData.name.trim()}
              >
                {editingId ? 'Update' : 'Add'} Medication
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};