#include "newuser.h"
#include "ui_newuser.h"
#include "wideuse.h"

Newuser::Newuser(QWidget *parent) :
    QDialog(parent),
    ui(new Ui::Newuser)
{
    ui->setupUi(this);
    ui->usrLineEdit->setFocus();
}

Newuser::~Newuser()
{
    delete ui;
}

void Newuser::on_loginBtn_clicked()
{
    QString name = ui->usrLineEdit->text();
    QString pwd = ui->pwdLineEdit->text();
    if(name.isEmpty() || pwd.isEmpty())
    {
        QMessageBox::warning(this, tr("警告！"),tr("用户名或密码不能为空！"),QMessageBox::Yes);
        ui->usrLineEdit->clear();
        ui->pwdLineEdit->clear();
        ui->usrLineEdit->setFocus();
    }
    else
    {
        QList<QString> log;
        log << "2" << name << pwd;
        emit logon(log);
    }

}

void Newuser::isOrNot(int flag)
{
    if(flag)
        success();
    else
        failed();
}

void Newuser::success()
{
    QString usrName = ui->usrLineEdit->text().toUtf8();
    localUser = new localUsr(usrName);

    accept();
}

void Newuser::failed()
{
    QMessageBox::warning(this, tr("警告！"),tr("该用户名已被注册！"),QMessageBox::Yes);
    ui->usrLineEdit->clear();
    ui->pwdLineEdit->clear();
    ui->usrLineEdit->setFocus();
}
