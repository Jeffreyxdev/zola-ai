import asyncio
import httpx

async def main():
    async with httpx.AsyncClient(timeout=10) as http:
        try:
            r = await http.get("https://api.jup.ag/price/v2?ids=SOL")
            print("V2 Response:", r.status_code, r.text)
        except Exception as e:
            print("V2 error", e)
        try:
            r = await http.get("https://price.jup.ag/v6/price?ids=SOL")
            print("V6 Response:", r.status_code, r.text)
        except Exception as e:
            print("V6 error", e)

asyncio.run(main())
