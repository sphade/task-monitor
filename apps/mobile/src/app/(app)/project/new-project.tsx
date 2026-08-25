import { useState } from 'react';
import { router } from 'expo-router';
import Toast from 'react-native-toast-message';

import { Button, Screen, TextField } from '@/components/ui/kit';

export default function NewProject() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (!name.trim()) {
      Toast.show({ type: 'error', text1: 'Project name is required' });
      return;
    }
    setLoading(true);
    // TODO: privateApi.post('/projects', { name, description, startDate: start, endDate: end })
    setTimeout(() => {
      setLoading(false);
      Toast.show({ type: 'success', text1: 'Project created' });
      router.back();
    }, 400);
  };

  return (
    <Screen>
      <TextField label="Name" value={name} onChangeText={setName} placeholder="Project name" />
      <TextField label="Description" value={description} onChangeText={setDescription} placeholder="Optional" multiline />
      <TextField label="Start date" value={start} onChangeText={setStart} placeholder="YYYY-MM-DD" />
      <TextField label="End date" value={end} onChangeText={setEnd} placeholder="YYYY-MM-DD" />
      <Button title="Create project" onPress={onSubmit} loading={loading} />
    </Screen>
  );
}
