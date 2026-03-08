import asyncio
import gemini_brain
async def main():
    res = await gemini_brain.interpret_command("show me recent activites", "BomSHWqSMH7Ptaccb8NnApQPCNoDrBN6q7RQxwsjPGag", {"cluster": "devnet"})
    print("Agent Response:", res)
asyncio.run(main())
