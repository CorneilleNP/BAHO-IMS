def login(api, user, password="pass12345!"):
    """Authenticate the client with a real JWT obtained from the login endpoint."""
    res = api.post("/api/v1/auth/login/", {"email": user.email, "password": password})
    assert res.status_code == 200, res.content
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['access']}")
    return res.data
