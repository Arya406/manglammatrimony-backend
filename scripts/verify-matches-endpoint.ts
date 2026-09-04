async function testMatches() {
  const token =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkZmFmNDRjNi1mM2U1LTQyNzItYTg3ZS0xNTJiZjBhY2QyNWYiLCJwaG9uZSI6Iis5MTk4NzY1NDMyMTAiLCJyb2xlcyI6WyJVU0VSIl0sInN0YXR1cyI6IkFDVElWRSIsImlhdCI6MTc4ODQ0MDc1NiwiZXhwIjoxNzg5MDQ1NTU2fQ.hysgRKBVj-4QsZhU6Mp3C6lKGHE-KU7n_DAYxQYZwRo";

  console.log("==================================================");
  console.log("TESTING GET /api/matches LIVE ENDPOINT");
  console.log("==================================================");

  const res = await fetch("http://localhost:5000/api/matches", {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const json = await res.json();
  console.log("HTTP STATUS:", res.status);
  console.log("SUCCESS:", json.success);
  console.log("TOTAL PROFILES DISCOVERED:", json.data?.profiles?.length);
  console.log("PAGINATION:", json.data?.pagination);
  console.log(
    "PROFILES:",
    json.data?.profiles?.map((p: any) => ({
      id: p.id,
      name: p.name,
      age: p.age,
      gender: p.gender,
      religion: p.religion,
      education: p.education,
      occupation: p.occupation,
      isVerified: p.isVerified,
    }))
  );
  console.log("==================================================");
}

testMatches().catch(console.error);
