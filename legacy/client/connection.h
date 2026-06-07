#ifndef CONNECTION_H
#define CONNECTION_H

#include <QMessageBox>
#include <QSqlDatabase>
#include <QSqlQuery>
#include <QApplication>

class Log : public QObject
{
    Q_OBJECT
public:
    Log();
    virtual ~Log();
    QString name;
public slots:
    void createConnection();
    bool freeConnection();
    void initDatabase();
    QString searchPwd(QString name);
    bool addNewusr(QString name,QString pwd);
    void addPokemon(QString name);
private:
    QSqlDatabase db;
};


#endif // CONNECTION_H
