import UIKit

class KeyboardViewController: UIInputViewController {

    private var searchBar: UITextField!
    private var resultsTableView: UITableView!
    private var suggestionsButton: UIButton!
    private var clipsButton: UIButton!

    private var searchResults: [[String: Any]] = []

    override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
    }

    private func setupUI() {
        view.backgroundColor = UIColor(red: 0.929, green: 0.906, blue: 0.859, alpha: 1.0) // #EDE7DB

        let headerView = UIView()
        headerView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(headerView)

        searchBar = UITextField()
        searchBar.placeholder = "Paroles, artiste..."
        searchBar.backgroundColor = UIColor(red: 0.961, green: 0.941, blue: 0.910, alpha: 1.0) // #F5F0E8
        searchBar.layer.cornerRadius = 8
        searchBar.leftView = UIView(frame: CGRect(x: 0, y: 0, width: 10, height: 36))
        searchBar.leftViewMode = .always
        searchBar.font = UIFont.systemFont(ofSize: 13)
        searchBar.translatesAutoresizingMaskIntoConstraints = false
        searchBar.addTarget(self, action: #selector(searchChanged), for: .editingChanged)
        searchBar.returnKeyType = .search
        headerView.addSubview(searchBar)

        let closeButton = UIButton(type: .system)
        closeButton.setImage(UIImage(systemName: "xmark.circle"), for: .normal)
        closeButton.tintColor = UIColor(red: 0.541, green: 0.494, blue: 0.427, alpha: 1.0) // #8A7E6D
        closeButton.translatesAutoresizingMaskIntoConstraints = false
        closeButton.addTarget(self, action: #selector(dismissKeyboard), for: .touchUpInside)
        headerView.addSubview(closeButton)

        resultsTableView = UITableView()
        resultsTableView.translatesAutoresizingMaskIntoConstraints = false
        resultsTableView.backgroundColor = .clear
        resultsTableView.separatorColor = UIColor(red: 0.839, green: 0.800, blue: 0.737, alpha: 1.0) // #D6CCBC
        resultsTableView.delegate = self
        resultsTableView.dataSource = self
        resultsTableView.register(UITableViewCell.self, forCellReuseIdentifier: "SongCell")
        view.addSubview(resultsTableView)

        let footerView = UIView()
        footerView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(footerView)

        suggestionsButton = UIButton(type: .system)
        suggestionsButton.setTitle("Suggestions IA", for: .normal)
        suggestionsButton.setImage(UIImage(systemName: "bolt.fill"), for: .normal)
        suggestionsButton.tintColor = UIColor(red: 0.769, green: 0.439, blue: 0.294, alpha: 1.0) // #C4704B
        suggestionsButton.translatesAutoresizingMaskIntoConstraints = false
        footerView.addSubview(suggestionsButton)

        clipsButton = UIButton(type: .system)
        clipsButton.setTitle("Mes clips", for: .normal)
        clipsButton.setImage(UIImage(systemName: "folder"), for: .normal)
        clipsButton.tintColor = UIColor(red: 0.541, green: 0.494, blue: 0.427, alpha: 1.0) // #8A7E6D
        clipsButton.translatesAutoresizingMaskIntoConstraints = false
        footerView.addSubview(clipsButton)

        NSLayoutConstraint.activate([
            headerView.topAnchor.constraint(equalTo: view.topAnchor, constant: 8),
            headerView.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 8),
            headerView.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -8),
            headerView.heightAnchor.constraint(equalToConstant: 40),

            searchBar.topAnchor.constraint(equalTo: headerView.topAnchor),
            searchBar.leadingAnchor.constraint(equalTo: headerView.leadingAnchor),
            searchBar.trailingAnchor.constraint(equalTo: closeButton.leadingAnchor, constant: -8),
            searchBar.heightAnchor.constraint(equalToConstant: 36),

            closeButton.centerYAnchor.constraint(equalTo: headerView.centerYAnchor),
            closeButton.trailingAnchor.constraint(equalTo: headerView.trailingAnchor),
            closeButton.widthAnchor.constraint(equalToConstant: 30),

            resultsTableView.topAnchor.constraint(equalTo: headerView.bottomAnchor, constant: 4),
            resultsTableView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            resultsTableView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            resultsTableView.bottomAnchor.constraint(equalTo: footerView.topAnchor, constant: -4),

            footerView.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 8),
            footerView.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -8),
            footerView.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: -8),
            footerView.heightAnchor.constraint(equalToConstant: 36),

            suggestionsButton.leadingAnchor.constraint(equalTo: footerView.leadingAnchor),
            suggestionsButton.centerYAnchor.constraint(equalTo: footerView.centerYAnchor),

            clipsButton.trailingAnchor.constraint(equalTo: footerView.trailingAnchor),
            clipsButton.centerYAnchor.constraint(equalTo: footerView.centerYAnchor),
        ])

        view.heightAnchor.constraint(equalToConstant: 320).isActive = true
    }

    @objc private func searchChanged() {
        guard let query = searchBar.text, !query.isEmpty else {
            searchResults = []
            resultsTableView.reloadData()
            return
        }

        let urlString = "https://singsing-production.up.railway.app/api/songs/search?q=\(query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")"
        guard let url = URL(string: urlString) else { return }

        URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            guard let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let results = json["results"] as? [[String: Any]] else { return }

            DispatchQueue.main.async {
                self?.searchResults = Array(results.prefix(5))
                self?.resultsTableView.reloadData()
            }
        }.resume()
    }

    @objc private func dismissKeyboard() {
        dismissKeyboard()
    }

    private func openSingSingApp(trackId: Int) {
        guard let url = URL(string: "singsing://editor?trackId=\(trackId)") else { return }
        let selector = NSSelectorFromString("openURL:")
        var responder: UIResponder? = self
        while let r = responder {
            if r.responds(to: selector) {
                r.perform(selector, with: url)
                return
            }
            responder = r.next
        }
    }
}

extension KeyboardViewController: UITableViewDelegate, UITableViewDataSource {
    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        return searchResults.count
    }

    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "SongCell", for: indexPath)
        let song = searchResults[indexPath.row]
        let title = song["trackName"] as? String ?? ""
        let artist = song["artistName"] as? String ?? ""
        cell.textLabel?.text = "\(title) — \(artist)"
        cell.textLabel?.font = UIFont.systemFont(ofSize: 14)
        cell.backgroundColor = .clear
        return cell
    }

    func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        let song = searchResults[indexPath.row]
        if let trackId = song["trackId"] as? Int {
            openSingSingApp(trackId: trackId)
        }
    }
}
