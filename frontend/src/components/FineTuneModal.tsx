import {
  Modal, ModalDialog, DialogTitle, DialogContent, DialogActions,
  Button, Input, Select, Option, Typography, CircularProgress
} from "@mui/joy";
import { useEffect, useState } from "react";
import { getDatasets, postFineTune } from "../lib/api";

export default function FineTuneModal({ open, onClose }) {
    const [dataset, setDataset] = useState("");
    const [adapterName, setAdapterName] = useState("");
    const [datasets, setDatasets] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [lr, setLr] = useState(5e-5);
    const [epochs, setEpochs] = useState(3);
    const [r, setR] = useState(8);
    const [alpha, setAlpha] = useState(16);
    const [dropout, setDropout] = useState(0.1);

    useEffect(() => {
        getDatasets().then(setDatasets);
    }, []);

    const handleSubmit = async () => {
    setIsLoading(true);
    try {
        await postFineTune({
        base_model: "meta-llama/Llama-3.2-1B-Instruct",
        dataset_name: dataset,
        adapter_name: adapterName,
        num_epochs: epochs,
        learning_rate: lr,
        lora_r: r,
        lora_alpha: alpha,
        lora_dropout: dropout,
        });
    } catch (err) {
        console.error("❌ Fine-tune failed:", err);
        alert(`Fine-tune failed: ${err.message}`);
    }
    setIsLoading(false);
    onClose();
    };


  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog>
        <DialogTitle>Fine-Tune LLaMA Model</DialogTitle>
        <DialogContent>
          <Typography>Select Dataset</Typography>
          <Select value={dataset} onChange={(_, v) => setDataset(v)}>
            {datasets.map((d) => (
              <Option key={d} value={d}>{d}</Option>
            ))}
          </Select>
          <Typography mt={1}>Adapter Name</Typography>
          <Input value={adapterName} onChange={(e) => setAdapterName(e.target.value)} />
          <Typography mt={2}>Epochs</Typography>
          <Input type="number" value={epochs} onChange={(e) => setEpochs(Number(e.target.value))} />
          <Typography mt={1}>Learning Rate</Typography>
          <Input type="number" value={lr} onChange={(e) => setLr(Number(e.target.value))} />
          <Typography mt={1}>LoRA R</Typography>
          <Input type="number" value={r} onChange={(e) => setR(Number(e.target.value))} />
          <Typography mt={1}>LoRA Alpha</Typography>
          <Input type="number" value={alpha} onChange={(e) => setAlpha(Number(e.target.value))} />
          <Typography mt={1}>Dropout</Typography>
          <Input type="number" value={dropout} onChange={(e) => setDropout(Number(e.target.value))} />
        </DialogContent>
        <DialogActions>
        <Button onClick={onClose} disabled={isLoading}>
            Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? (
            <>
                Fine-Tuning&nbsp;
                <CircularProgress
                size="sm"
                thickness={2}
                sx={{ '--CircularProgress-size': '14px' }}
                />
            </>
            ) : (
            "Start Fine-Tune"
            )}
        </Button>
        </DialogActions>

      </ModalDialog>
    </Modal>
  );
}
