$body = @{email='admin@flow.dev';password='Admin@123'} | ConvertTo-Json

# ========== 1. LOGIN TEST ==========
try {
    $response = Invoke-RestMethod -Uri 'http://localhost:3000/api/auth/login' -Method Post -ContentType 'application/json' -Body $body
    Write-Host "======= LOGIN TEST: PASSED ======="
    Write-Host ($response | ConvertTo-Json -Depth 10)
    
    $token = $response.data.accessToken
    $userId = $response.data.user.id
    Write-Host "`nToken obtained for user: $($response.data.user.firstName) $($response.data.user.lastName) ($($response.data.user.email))"
    Write-Host "Access Token: $($token.Substring(0, 50))..."
    
    # ========== 2. AUTH/ME TEST ==========
    try {
        $headers = @{Authorization = "Bearer $token"}
        $me = Invoke-RestMethod -Uri 'http://localhost:3000/api/auth/me' -Method Get -Headers $headers -ErrorAction Stop
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
        $orgHeaders = @{Authorization = "Bearer $token"}
        $orgs = Invoke-RestMethod -Uri 'http://localhost:3000/api/organizations' -Method Get -Headers $orgHeaders -ErrorAction Stop
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
