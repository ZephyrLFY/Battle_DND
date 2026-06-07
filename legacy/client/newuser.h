#ifndef NEWUSER_H
#define NEWUSER_H

#include <QDialog>
#include <QMessageBox>
#include <QtNetwork>
#include <unistd.h>

namespace Ui {
class Newuser;
}

class Newuser : public QDialog
{
    Q_OBJECT

public:
    explicit Newuser(QWidget *parent = nullptr);
    ~Newuser();
    void success();
    void failed();
signals:
    void logon(QList<QString>&);
private slots:
    void isOrNot(int flag);
    void on_loginBtn_clicked();
private:
    Ui::Newuser *ui;
};

#endif // NEWUSER_H
