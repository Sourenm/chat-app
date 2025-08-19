// Voice.tsx
import { Tabs, TabList, Tab, TabPanel, Box } from '@mui/joy';
import { useState } from 'react';
import TTSPage from './TTSPage';
import VTS from './VTS';

export default function Voice() {
  const [subTab, setSubTab] = useState(0);

  return (
    <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Tabs value={subTab} onChange={(_, v) => setSubTab(v)} sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <TabList>
          <Tab>Text → Speech</Tab>
          <Tab>Voice → Text</Tab>
        </TabList>

        <TabPanel value={0} sx={{ flex: 1, overflow: 'auto' }}>
          <TTSPage />
        </TabPanel>

        <TabPanel value={1} sx={{ flex: 1, overflow: 'auto' }}>
          <VTS />
        </TabPanel>
      </Tabs>
    </Box>
  );
}
