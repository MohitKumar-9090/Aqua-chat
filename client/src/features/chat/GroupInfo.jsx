import { useState, useRef, useEffect } from 'react';
import { 
  ArrowLeft, 
  Camera, 
  Check, 
  Edit2, 
  LogOut, 
  Plus, 
  Trash2, 
  UserMinus, 
  UserPlus, 
  ShieldAlert,
  ShieldCheck,
  X 
} from 'lucide-react';
import Avatar from '../../components/Avatar.jsx';
import { api } from '../../api.js';
import { success as toastSuccess, error as toastError } from '../../utils/toast.js';

export default function GroupInfo({
  chat,
  me,
  users,
  onClose,
  onUpdateGroup,
  onAddMembers,
  onRemoveMember,
  onMakeAdmin,
  onTransferAdmin,
  onExitGroup,
  onDeleteGroup
}) {
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState(chat.name || '');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [addSearchQuery, setAddSearchQuery] = useState('');
  
  // States for member actions menu
  const [selectedMemberMenu, setSelectedMemberMenu] = useState(null); // stores user object
  const fileInputRef = useRef(null);

  // Sync group name state when chat updates
  useEffect(() => {
    setNewName(chat.name || '');
  }, [chat.name]);

  const uid = me?._id || me?.uid;
  const amAdmin = chat.createdBy === uid || chat.adminIds?.includes(uid);
  const isCreator = chat.createdBy === uid;

  const handleNameSave = async () => {
    if (!newName.trim() || newName === chat.name) {
      setEditingName(false);
      return;
    }
    try {
      await onUpdateGroup({ name: newName.trim() });
      toastSuccess('Group name updated');
      setEditingName(false);
    } catch (err) {
      toastError(err.message || 'Could not update name');
    }
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const res = await api.upload(file);
      await onUpdateGroup({ avatarUrl: res.url });
      toastSuccess('Group image updated');
    } catch (err) {
      toastError(err.message || 'Could not upload image');
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleMemberActionClick = (participant) => {
    if (!amAdmin || participant.user._id === uid) return;
    setSelectedMemberMenu(selectedMemberMenu === participant.user._id ? null : participant.user._id);
  };

  // Filter users to find who can be added to the group
  const addableUsers = users.filter(
    (u) => !chat.participantIds.includes(u._id) && u._id !== uid
  ).filter(u => 
    u.displayName?.toLowerCase().includes(addSearchQuery.toLowerCase()) || 
    u.username?.toLowerCase().includes(addSearchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex h-full w-full flex-col border-l border-aqua-100/40 bg-slate-50 shadow-2xl transition-all duration-300 transform translate-x-0 sm:w-[380px] animate-slide-in">
      
      {/* Top Header */}
      <header className="flex items-center gap-3 bg-white px-4 py-4 shadow-sm border-b border-aqua-100/20">
        <button 
          onClick={onClose} 
          className="rounded-2xl p-1.5 text-cyan-700 hover:bg-aqua-50 transition active:scale-95"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 className="text-md font-black text-cyan-950">Group Info</h2>
          <p className="text-xs text-slate-500">{chat.participants?.length} members</p>
        </div>
      </header>

      {/* Main scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5">
        
        {/* Profile Card */}
        <div className="flex flex-col items-center bg-white rounded-3xl p-5 border border-aqua-100/20 shadow-sm relative overflow-hidden">
          
          {/* Group Photo Section */}
          <div className="relative group/avatar cursor-pointer" onClick={() => amAdmin && fileInputRef.current?.click()}>
            <Avatar name={chat.name} image={chat.avatarUrl} size="xl" className="shadow-md" />
            
            {amAdmin && (
              <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/45 opacity-0 group-hover/avatar:opacity-100 transition-opacity duration-200">
                <Camera size={24} className="text-white" />
              </div>
            )}
            
            {uploadingPhoto && (
              <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/60">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
              </div>
            )}

            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handlePhotoUpload} 
              accept="image/*" 
              className="hidden" 
            />
          </div>

          {/* Group Name editing */}
          <div className="mt-4 w-full text-center px-4">
            {editingName ? (
              <div className="flex items-center gap-2 border-b border-cyan-500 pb-1 mx-auto max-w-[240px]">
                <input 
                  type="text" 
                  value={newName} 
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleNameSave()}
                  className="w-full text-center text-md font-bold text-slate-800 outline-none bg-transparent"
                  autoFocus
                />
                <button onClick={handleNameSave} className="text-emerald-600 p-1 hover:bg-emerald-50 rounded-lg">
                  <Check size={16} />
                </button>
                <button onClick={() => { setEditingName(false); setNewName(chat.name); }} className="text-rose-600 p-1 hover:bg-rose-50 rounded-lg">
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2">
                <h3 className="text-lg font-black text-slate-800 truncate max-w-[200px]">{chat.name}</h3>
                {amAdmin && (
                  <button 
                    onClick={() => setEditingName(true)} 
                    className="text-slate-400 hover:text-cyan-600 transition p-1 hover:bg-slate-50 rounded-lg"
                  >
                    <Edit2 size={14} />
                  </button>
                )}
              </div>
            )}
            <p className="text-xs text-slate-400 mt-1">Created on {new Date(chat.participants?.[0]?.joinedAt || chat.updatedAt).toLocaleDateString()}</p>
          </div>
        </div>

        {/* Members List Box */}
        <div className="bg-white rounded-3xl p-4 border border-aqua-100/20 shadow-sm space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-black text-cyan-950 uppercase tracking-wider">{chat.participants?.length} Members</span>
            {amAdmin && (
              <button 
                onClick={() => setAddMembersOpen(true)}
                className="flex items-center gap-1 rounded-xl bg-cyan-50 hover:bg-cyan-100 text-cyan-700 px-3 py-1.5 text-xs font-bold transition active:scale-95 border border-cyan-100"
              >
                <Plus size={14} /> Add Member
              </button>
            )}
          </div>

          <div className="divide-y divide-slate-100 max-h-[280px] overflow-y-auto pr-1">
            {chat.participants?.map((participant) => {
              const isAdminRole = chat.adminIds?.includes(participant.user?._id) || chat.createdBy === participant.user?._id;
              const isSelf = participant.user?._id === uid;
              
              return (
                <div key={participant.user?._id} className="py-2.5 relative">
                  <div 
                    onClick={() => handleMemberActionClick(participant)}
                    className={`flex items-center justify-between gap-3 p-1 rounded-2xl transition cursor-pointer hover:bg-slate-50`}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar name={participant.user?.displayName} image={participant.user?.photoURL} size="md" />
                      <div className="min-w-0">
                        <span className="block font-bold text-sm text-slate-800 truncate max-w-[140px]">
                          {participant.user?.displayName} {isSelf && '(You)'}
                        </span>
                        <span className="block text-[11px] text-slate-400 truncate">
                          @{participant.user?.username || 'user'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isAdminRole && (
                        <span className="rounded-full bg-emerald-50 text-emerald-600 px-2 py-0.5 text-[9px] font-bold border border-emerald-100">
                          Admin
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions overlay for this member */}
                  {selectedMemberMenu === participant.user?._id && (
                    <div className="absolute right-0 top-full mt-1 z-30 min-w-[150px] overflow-hidden rounded-2xl border border-slate-100 bg-white py-1 shadow-xl animate-pop">
                      {!chat.adminIds?.includes(participant.user?._id) && (
                        <button
                          onClick={async () => {
                            setSelectedMemberMenu(null);
                            try {
                              await onMakeAdmin(participant.user._id);
                              toastSuccess(`${participant.user.displayName} is now an admin`);
                            } catch (err) {
                              toastError(err.message);
                            }
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
                        >
                          <ShieldCheck size={14} className="text-emerald-500" />
                          Make Admin
                        </button>
                      )}
                      <button
                        onClick={async () => {
                          setSelectedMemberMenu(null);
                          try {
                            await onTransferAdmin(participant.user._id);
                            toastSuccess(`Admin rights transferred to ${participant.user.displayName}`);
                          } catch (err) {
                            toastError(err.message);
                          }
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
                      >
                        <ShieldAlert size={14} className="text-indigo-500" />
                        Transfer Admin
                      </button>
                      <button
                        onClick={async () => {
                          setSelectedMemberMenu(null);
                          try {
                            await onRemoveMember(participant.user._id);
                            toastSuccess(`${participant.user.displayName} removed`);
                          } catch (err) {
                            toastError(err.message);
                          }
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs font-bold text-rose-600 hover:bg-rose-50/50 transition border-t border-slate-50"
                      >
                        <UserMinus size={14} className="text-rose-500" />
                        Remove Member
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Danger Zone Actions */}
        <div className="bg-white rounded-3xl p-3 border border-rose-100 shadow-sm flex flex-col gap-2">
          <button 
            onClick={onExitGroup}
            className="w-full flex items-center justify-center gap-2.5 rounded-2xl bg-rose-50/50 hover:bg-rose-50 text-rose-600 py-3 text-sm font-bold transition active:scale-[0.98]"
          >
            <LogOut size={16} /> Exit Group
          </button>
          
          {(isCreator || amAdmin) && (
            <button 
              onClick={onDeleteGroup}
              className="w-full flex items-center justify-center gap-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white py-3 text-sm font-bold transition active:scale-[0.98] shadow-lg shadow-rose-900/10"
            >
              <Trash2 size={16} /> Delete Group
            </button>
          )}
        </div>

      </div>

      {/* Add Members Sub-Modal Overlay */}
      {addMembersOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl border border-slate-100 animate-pop flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-md font-black text-slate-900">Add members</h3>
              <button 
                onClick={() => { setAddMembersOpen(false); setAddSearchQuery(''); }} 
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>
            
            <input 
              type="text"
              placeholder="Search people..."
              value={addSearchQuery}
              onChange={(e) => setAddSearchQuery(e.target.value)}
              className="w-full rounded-2xl border border-aqua-100 bg-aqua-25 px-4 py-2 text-sm outline-none focus:border-cyan-500 mb-3"
            />

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[150px]">
              {addableUsers.length > 0 ? (
                addableUsers.map((user) => (
                  <button
                    key={user._id}
                    onClick={async () => {
                      try {
                        await onAddMembers([user._id]);
                        toastSuccess(`${user.displayName} added to group`);
                      } catch (err) {
                        toastError(err.message);
                      }
                    }}
                    className="w-full flex items-center justify-between p-2 rounded-2xl hover:bg-aqua-50/50 transition text-left"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar name={user.displayName} image={user.photoURL} size="md" />
                      <div>
                        <span className="block font-bold text-sm text-slate-800">{user.displayName}</span>
                        <span className="block text-xs text-slate-400">@{user.username || 'user'}</span>
                      </div>
                    </div>
                    <UserPlus size={16} className="text-cyan-600 mr-2" />
                  </button>
                ))
              ) : (
                <p className="text-center text-xs text-slate-400 py-6">No addable users found</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
