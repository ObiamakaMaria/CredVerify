import React, { useEffect, useState } from 'react';
import { createAppKit } from "@reown/appkit/react";
import { EthersAdapter } from "@reown/appkit-adapter-ethers";
import { arbitrum, mainnet } from "@reown/appkit/networks";

const projectId = process.env.VITE_REOWN_PROJECT_ID;

const metadata = {
  name: "My dApp",
  description: "My Web3 application",
  url: window.location.origin,
  icons: ["https://mydapp.com/icon.png"],
};

const appKit = createAppKit({
  adapters: [new EthersAdapter()],
  networks: [arbitrum, mainnet],
  metadata,
  projectId,
  features: {
    analytics: true,
  },
});

function ConnectButton() {
  const [connected, setConnected] = useState(false);
  const [address, setAddress] = useState("");

  useEffect(() => {
    const checkConnection = async () => {
      try {
        if (appKit.isConnected?.()) {
          const accounts = await appKit.getAccounts?.();
          if (accounts && accounts.length > 0) {
            setConnected(true);
            setAddress(accounts[0]);
          }
        }
      } catch (error) {
        console.error("Connection check error:", error);
      }
    };

    checkConnection();

    const handleAccountsChanged = (accounts) => {
      if (accounts && accounts.length > 0) {
        setConnected(true);
        setAddress(accounts[0]);
      } else {
        setConnected(false);
        setAddress("");
      }
    };

    appKit.on?.('accountsChanged', handleAccountsChanged);

    return () => {
      appKit.off?.('accountsChanged', handleAccountsChanged);
    };
  }, []);

  const openConnectModal = () => {
    try {
      console.log("Opening modal...");
      if (appKit.open) {
        appKit.open();
      } else if (appKit.connect) {
        appKit.connect();
      }
    } catch (error) {
      console.error("Error opening modal:", error);
    }
  };

  const openNetworkModal = () => {
    try {
      console.log("Opening network modal...");
      if (appKit.open) {
        appKit.open({ view: "Networks" });
      }
    } catch (error) {
      console.error("Error opening network modal:", error);
    }
  };

  return (
    <div>
      {!connected ? (
        <div>
          <button 
            onClick={openConnectModal} 
            style={{
              backgroundColor: "#3498db",
              color: "white",
              border: "none",
              padding: "10px 20px",
              borderRadius: "5px",
              cursor: "pointer",
              fontWeight: "bold",
              marginRight: "10px"
            }}
          >
            Connect Wallet
          </button>
          
          <button 
            onClick={openNetworkModal} 
            style={{
              backgroundColor: "#2ecc71",
              color: "white",
              border: "none",
              padding: "10px 20px",
              borderRadius: "5px",
              cursor: "pointer",
              fontWeight: "bold"
            }}
          >
            Select Network
          </button>
        </div>
      ) : (
        <div style={{ 
          padding: "15px", 
          backgroundColor: "#f8f9fa",
          borderRadius: "8px",
          boxShadow: "0 2px 5px rgba(0,0,0,0.1)"
        }}>
          <h3>Connected!</h3>
          <p><strong>Address:</strong> {address}</p>
          <button 
            onClick={openConnectModal}
            style={{
              backgroundColor: "#e74c3c",
              color: "white",
              border: "none",
              padding: "8px 16px",
              borderRadius: "5px",
              cursor: "pointer",
              fontWeight: "bold",
              marginTop: "10px"
            }}
          >
            Manage Connection
          </button>
        </div>
      )}
    </div>
  );
}

function App() {
  return (
    <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
      <h1>AppKit Wallet Connection</h1>
      <ConnectButton />
    </div>
  );
}

export default App;