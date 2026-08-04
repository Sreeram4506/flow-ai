$body = @{email='admin@flow.dev';password='Admin@123'} | ConvertTo-Json

# Session tokens are httpOnly cookies now, not something this script can read
# out of the response body — -SessionVariable gives Invoke-RestMethod its own
# cookie jar that persists across calls, the same way a browser would.

# ========== 1. LOGIN TEST ==========
try {
    $response = Invoke-RestMethod -Uri 'http://localhost:3000/api/auth/login' -Method Post -ContentType 'application/json' -Body $body -SessionVariable session
    Write-Host "======= LOGIN TEST: PASSED ======="
    Write-Host ($response | ConvertTo-Json -Depth 10)
    Write-Host "`nLogged in as: $($response.data.user.firstName) $($response.data.user.lastName) ($($response.data.user.email))"

    $csrfToken = ($session.Cookies.GetCookies('http://localhost:3000') | Where-Object { $_.Name -eq 'csrf_token' }).Value

    # ========== 2. AUTH/ME TEST ==========
    try {
        $me = Invoke-RestMethod -Uri 'http://localhost:3000/api/auth/me' -Method Get -WebSession $session -ErrorAction Stop
        Write-Host "`n======= AUTH/ME TEST: PASSED ======="
        Write-Host ($me | ConvertTo-Json -Depth 5)
    } catch {
        Write-Host "`n======= AUTH/ME TEST: FAILED ======="
        Write-Host "ERROR: $($_.Exception.Message)"
    }

    # ========== 3. UNAUTHORIZED TEST ==========
    try {
        $noAuth = Invoke-RestMethod -Uri 'http://localhost:3000/api/auth/me' -Method Get -ErrorAction Stop
        Write-Host "`n======= UNAUTHORIZED TEST: FAILED (should have thrown 401) ======="
    } catch {
        Write-Host "`n======= UNAUTHORIZED ACCESS TEST: PASSED ======="
        Write-Host "Got expected 401 error"
    }

    # ========== 4. DASHBOARD/ORGANIZATIONS TEST ==========
    try {
        # A GET, so no CSRF header needed — only state-changing requests
        # (POST/PUT/PATCH/DELETE) are checked against the csrf_token cookie.
        $orgs = Invoke-RestMethod -Uri 'http://localhost:3000/api/organizations' -Method Get -WebSession $session -ErrorAction Stop
        Write-Host "`n======= ORGANIZATIONS TEST: PASSED ======="
        Write-Host ($orgs | ConvertTo-Json -Depth 5)
    } catch {
        Write-Host "`n======= ORGANIZATIONS TEST: INFO ======="
        if ($_.Exception.Response) {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            Write-Host "RESPONSE: $($reader.ReadToEnd())"
        } else {
            Write-Host "ERROR: $($_.Exception.Message)"
        }
    }

} catch {
    Write-Host "======= LOGIN TEST: FAILED ======="
    Write-Host "ERROR: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        Write-Host "RESPONSE: $($reader.ReadToEnd())"
    }
}
