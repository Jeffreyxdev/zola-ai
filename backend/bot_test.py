import json
import time
from solana.rpc.api import Client
from solders.keypair import Keypair
from solana.rpc.commitment import Confirmed
from solders.system_program import TransferParams, transfer
from solders.transaction import Transaction
from solders.message import Message

# 1. Setup Connection to your Local Validator
URL = "http://127.0.0.1:8899"
client = Client(URL, commitment=Confirmed)

def send_sol_with_retry(sender: Keypair, receiver_pubkey, amount_sol: float, max_retries: int = 5):
    """Robust function to send SOL with automatic retries and backoff"""
    lamports = int(amount_sol * 1_000_000_000)
    
    for attempt in range(max_retries):
        try:
            # Refresh blockhash for every attempt to prevent expiration
            recent_blockhash = client.get_latest_blockhash().value.blockhash
            
            # Build and sign the transaction
            ix = transfer(TransferParams(
                from_pubkey=sender.pubkey(),
                to_pubkey=receiver_pubkey,
                lamports=lamports
            ))
            msg = Message.new_with_blockhash([ix], sender.pubkey(), recent_blockhash)
            txn = Transaction([sender], msg, recent_blockhash)

            # Send the transaction
            result = client.send_transaction(txn)
            print(f"✅ Success on Attempt {attempt + 1}! Sig: {result.value}")
            return result.value

        except Exception as e:
            # Exponential Backoff: Wait longer with each failure (2s, 4s, 8s...)
            wait_time = 2 ** (attempt + 1)
            print(f"⚠️ Attempt {attempt + 1} failed: {e}. Retrying in {wait_time}s...")
            time.sleep(wait_time)
            
    print("❌ All retry attempts failed.")
    return None

# --- TEST EXECUTION ---
# Load your wallet path verified in your setup
with open(r"C:\Users\HELLO\.config\solana\id.json", "r") as f:
    sender = Keypair.from_bytes(bytes(json.load(f)))

# Send a test 1.0 SOL to a random address
send_sol_with_retry(sender, Keypair().pubkey(), 1.0)