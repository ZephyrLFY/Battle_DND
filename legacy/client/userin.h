#ifndef USERIN_H
#define USERIN_H

#include <QDialog>
#include <QMessageBox>
#include <QSqlQuery>
#include <QtNetwork>
#include <QList>
#include <unistd.h>

namespace Ui {
class UserIn;
}

class UserIn : public QDialog
{
    Q_OBJECT

public:
    explicit UserIn(QWidget *parent = nullptr);
    ~UserIn();

    void success();
    void failed(int which);
signals:
    void login(QList<QString>&);
private slots:
    void on_loginBtn_clicked();
    void isOrNot(int flag);

private:
    Ui::UserIn *ui;
};

#endif // USERIN_H
