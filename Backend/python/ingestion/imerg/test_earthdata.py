import earthaccess

print("NASA Earthdata authentication test")

auth = earthaccess.login(
    strategy="interactive",
    persist=True
)

print("Authentication successful.")
print(auth)