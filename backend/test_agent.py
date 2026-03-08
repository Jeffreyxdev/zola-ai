import asyncio
import gemini_brain

async def main():
    print("Testing balance inference:")
    res = await gemini_brain.interpret_command("what is my balance?", "BomSHWqSMH7Ptaccb8NnApQPCNoDrBN6q7RQxwsjPGag", {"cluster":"devnet"})
    print("RESPONSE:", res)
    
    print("Testing DCA inference:")
    res2 = await gemini_brain.interpret_command("Setup a $10 weekly DCA into JUP", "BomSHWqSMH7Ptaccb8NnApQPCNoDrBN6q7RQxwsjPGag", {"cluster":"mainnet-beta"})
    print("RESPONSE:", res2)

if __name__ == "__main__":
    asyncio.run(main())
